# brahma

> **brahma watches your USDC across chains 24/7, finds the best Aave V3 yield, and moves your funds there automatically using LI.FI bridges — no clicks required.**

An autonomous DeFi operations system built for the **LI.FI Vibeathon**. Two fully autonomous strategies from a single dashboard: a cross-chain USDC Yielder powered by Aave V3 + Compound V3 + LI.FI, and an LP Guardian that watches Uniswap V3 positions and evacuates liquidity when risk thresholds are breached.

---

## Modes

### Yielder
Continuously scans USDC yield across 10 DeFi protocols on 4 chains using DeFiLlama. Every 30 seconds, the agent:

1. Fetches live APY data from DeFiLlama across Aave V3, Compound V3, Morpho, Fluid, Spark, Euler, Moonwell, Seamless, and Ionic
2. Detects the current on-chain position by reading actual aToken balances across all chains
3. Gets a real bridge cost from LI.FI's quote API to factor into the decision
4. Asks an LLM (MOVE / STAY / WITHDRAW) with the full yield table + bridge cost as context
5. If MOVE: withdraws from current Aave/Compound position, bridges cross-chain via LI.FI SDK, deposits on the target chain

Supports **Simulation (Dry Run)** and **Live** modes. In dry-run, all steps are validated via `simulateContract` and `eth_call` without broadcasting transactions.

### Guardian
Monitors a Uniswap V3 LP position tick in real time. When tick delta exceeds the risk threshold, an LLM evaluates the position (EVACUATE / WAIT / PARTIAL). On evacuation:
1. Withdraws liquidity via `NonfungiblePositionManager.decreaseLiquidity` + `collect` (MEV-protected via Flashbots)
2. Bridges both token0 and token1 to the target chain via LI.FI `getRoutes` → `executeRoute`

---

## LI.FI Integration — Full Detail

LI.FI is the **sole bridging layer** for both modes. Every cross-chain move goes through LI.FI.

### SDK Version
```
@lifi/sdk ^3.15.7
```

### SDK Initialization (`src/lib/shared/lifiClient.ts`)

The SDK is initialized as a **singleton** with a guard against double-init. It must be re-initialized when the source chain changes because the wallet client is chain-specific.

```ts
import { createConfig, EVM } from "@lifi/sdk";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

let configuredKey: string | null = null;
let configuredChainId: number | null = null;

export function initLiFi(privateKey: string, chainId: number) {
  if (configuredKey === privateKey && configuredChainId === chainId) return;

  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const chain = CHAIN_MAP[chainId];

  createConfig({
    integrator: "brahma",
    providers: [
      EVM({
        getWalletClient: async () =>
          createWalletClient({
            account,
            chain,
            transport: http(YIELD_CHAINS[chainId].txRpcUrl), // Alchemy for reliable signing
          }),
        switchChain: async (targetChainId) => {
          const targetChain = CHAIN_MAP[targetChainId];
          if (!targetChain) throw new Error(`Unsupported chain: ${targetChainId}`);
          return createWalletClient({
            account,
            chain: targetChain,
            transport: http(YIELD_CHAINS[targetChainId].txRpcUrl),
          });
        },
      }),
    ],
  });

  configuredKey = privateKey;
  configuredChainId = chainId;
}
```

**Key decisions:**
- `txRpcUrl` (Alchemy) is used instead of public RPCs for wallet clients — `executeRoute` needs reliable RPC for tx submission
- `switchChain` callback is implemented so LI.FI can handle multi-step routes that require chain switching mid-execution
- Re-init is triggered when source chain changes (e.g. agent moves from Arbitrum to Base — next bridge needs a Base wallet client)

---

### Yielder Bridge Flow (`src/lib/yield/yieldBridge.ts`)

Three methods with increasing weight:

#### 1. `fetchQuoteCost()` — Lightweight pre-decision quote
Called **before** the LLM to give it real bridge cost data. No `eth_call`, just the quote API.

```ts
const step = await getQuote({
  fromChain: fromChainId,
  toChain: toChainId,
  fromToken: from.usdc,        // native USDC — not USDC.e
  toToken: to.usdc,
  fromAmount: amount.toString(),
  fromAddress: this.address,
  integrator: "brahma",
  slippage: 0.005,             // 0.5% — tight for stablecoin-to-stablecoin
});

const bridgeCostUsdc = (Number(amount) - Number(step.estimate?.toAmount)) / 1e6;
```

The LLM receives: `"Bridge cost: $0.0123 USDC via Across"` — letting it factor real fees into the MOVE/STAY decision.

#### 2. `getDryRunQuote()` — Full simulation
Used in DRY_RUN mode. Quote + `eth_call` to validate the bridge calldata:

```ts
const step = await getQuote({ ... });

// Simulate the ERC20 approval
await publicClient.simulateContract({
  address: usdc,
  abi: ERC20_ABI,
  functionName: "approve",
  args: [step.transactionRequest.to, amount],
  account: this.address,
});

// Simulate the bridge tx
await publicClient.call({
  account: this.address,
  to: step.transactionRequest.to,
  data: step.transactionRequest.data,
  value: step.transactionRequest.value,
});
// Approval-gated reverts are expected and caught — confirms route is valid
```

#### 3. `executeBridge()` — Live execution
```ts
// Init SDK with source chain wallet client
initLiFi(this.privateKey, fromChainId);

const step = await getQuote({ fromChain, toChain, fromToken, toToken, fromAmount, ... });

if (!step.transactionRequest?.to) {
  throw new Error("LI.FI returned no transaction request — aborting");
}

const route = convertQuoteToRoute(step);  // wraps LiFiStep into Route

await executeRoute(route, {
  updateRouteHook: (updated) => {
    const status = updated.steps?.[0]?.execution?.status;
    if (status) this.log("INFO", `Bridge: ${status}`); // streams to agent log
  },
});
```

**Why `getQuote` + `convertQuoteToRoute` instead of `getRoutes`:**
- `getQuote` returns the optimal single route with a pre-populated `transactionRequest` — one API call
- `getRoutes` returns multiple routes and requires a separate `getStepTransaction` call to get calldata
- `convertQuoteToRoute` wraps the `LiFiStep` into a `Route` that `executeRoute` expects
- This pattern is faster and avoids route expiry between the `getRoutes` call and execution

**Slippage:** 0.5% (`slippage: 0.005`) — tight for stablecoin-to-stablecoin transfers where price impact is minimal.

---

### Guardian Evacuation Flow (`src/lib/guardian/executor.ts`)

```ts
// Step 1: Withdraw from Uniswap V3 (MEV-protected via Flashbots RPC)
await walletClient.writeContract({
  address: POSITION_MANAGER,
  functionName: "decreaseLiquidity",
  args: [{ tokenId, liquidity, amount0Min, amount1Min, deadline }],
});

await walletClient.writeContract({
  address: POSITION_MANAGER,
  functionName: "collect",
  args: [{ tokenId, recipient, amount0Max: MAX_UINT128, amount1Max: MAX_UINT128 }],
});

// Step 2: Bridge both tokens via LI.FI (getRoutes → executeRoute)
const { routes } = await getRoutes({
  fromChainId,
  toChainId,
  fromTokenAddress: token0,
  toTokenAddress: targetToken,  // e.g. USDC on target chain
  fromAmount: amount0.toString(),
  fromAddress: this.address,
});

await executeRoute(routes[0], { updateRouteHook });
```

The Guardian uses `getRoutes` (not `getQuote`) because evacuation needs multi-token flexibility — it bridges token0 and token1 separately, each potentially needing different routing.

---

### Bridge Quote as LLM Input

Before every LLM decision, brahma fetches a real bridge quote and passes the cost:

```ts
const preQuote = await bridge.fetchQuoteCost(currentChainId, best.chainId, amount);
// → "$0.0123 USDC via Across"

const decision = await getYieldDecision(currentPosition, actionableYields, bridgeCostForLlm);
```

LLM prompt includes:
```
Estimated bridge cost: $0.0123 USDC via Across
Minimum APY difference to justify move: 2%
```

This ensures the LLM evaluates whether the yield improvement covers the one-time bridge fee.

---

### Supported Chains

| Chain | Chain ID | USDC | Aave V3 Pool | Compound V3 Comet |
|---|---|---|---|---|
| Base | 8453 | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | `0xA238Dd80C259a72e81d7e4664a9801593F98d1c5` | `0xb125E6687d4313864e53df431d5425969c15Eb2F` |
| Arbitrum | 42161 | `0xaf88d065e77c8cC2239327C5EDb3A432268e5831` | `0x794a61358D6845594F94dc1DB02A252b5b4814aD` | `0x9c4ec768c28520B50860ea7a15bd7213a9fF58bf` |
| Optimism | 10 | `0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85` | `0x794a61358D6845594F94dc1DB02A252b5b4814aD` | `0x2e44e174f7D53F0212823acC11C01A11d58c5bCB` |
| Polygon | 137 | `0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359` | `0x794a61358D6845594F94dc1DB02A252b5b4814aD` | `0xF25212E676D1F7F89Cd72fFEe66158f541246445` |

**RPC strategy per chain:**
- `rpcUrl` — Alchemy for reads: `balanceOf`, `getATokenBalance`, dry-run `simulateContract`, `eth_call`
- `txRpcUrl` — Alchemy for writes: `approve`, `supply`, `withdraw`, bridge tx submission, LI.FI `executeRoute`

Using the same Alchemy key for both removes rate limit divergence between read and write paths.

---

## Protocol Integrations

### Aave V3 (`src/lib/yield/aaveDepositor.ts`)

```ts
// Supply
await walletClient.writeContract({
  address: aavePool,
  functionName: "supply",
  args: [usdc, amount, account, 0],
});

// Withdraw (full position using maxUint256)
await walletClient.writeContract({
  address: aavePool,
  functionName: "withdraw",
  args: [usdc, maxUint256, account],
});
// Actual received = post-withdraw USDC balance delta (not pre-read aToken)
```

### Compound V3 (`src/lib/yield/compoundDepositor.ts`)

```ts
// Supply
await walletClient.writeContract({
  address: comet,
  functionName: "supply",
  args: [usdc, amount],
});

// Withdraw — must pass exact balance (not maxUint256)
const cometBalance = await publicClient.readContract({ functionName: "balanceOf", ... });
await walletClient.writeContract({
  address: comet,
  functionName: "withdraw",
  args: [usdc, cometBalance], // exact amount required by Compound V3
});
```

Both depositors:
- Check native gas balance before any live tx — surfaces a clear error if the wallet has no ETH/POL for gas
- Verify `receipt.status === "success"` on every tx — reverted txs never silently pass
- Use `simulateContract` in dry-run mode and catch reverts gracefully (approval-gated reverts are expected)

---

## Yield Scanner (`src/lib/yield/yieldScanner.ts`)

Queries `https://yields.llama.fi/pools` with a 60-second cache. Filters for:
- USDC / USDC.E / USDC.e symbol
- TVL > $100k
- Supported chains only

| Protocol | Actionable (agent executes) | UI Only |
|---|---|---|
| Aave V3 | Yes | — |
| Compound V3 | Yes | — |
| Morpho Blue | — | Yes |
| Morpho | — | Yes |
| Moonwell | — | Yes |
| Seamless Protocol | — | Yes |
| Fluid | — | Yes |
| Spark | — | Yes |
| Euler | — | Yes |
| Ionic Protocol | — | Yes |

Non-actionable protocols appear in the Yield Scanner table (dimmed) for market context. Only `actionable: true` pools are passed to the LLM.

---

## LLM Decision Engine (`src/lib/yield/yieldLlm.ts`)

Model: `nvidia/nemotron-3-nano-30b-a3b:free` via OpenRouter

```
System: You are an autonomous DeFi yield optimizer. Decide whether to move capital
        to the highest-yielding Aave V3 USDC pool. Respond ONLY with valid JSON.

User:   Currently deposited on Base earning 2.53% APY

        Available Aave V3 USDC yields:
        Arbitrum (42161): 4.21% APY | TVL $45.2M
        Base (8453): 2.53% APY | TVL $312.1M
        Polygon (137): 2.54% APY | TVL $1.2M

        Estimated bridge cost: $0.0123 USDC via Across
        Minimum APY difference to justify move: 2%

        Decide: MOVE, STAY, or WITHDRAW.
        Response: {"action":"MOVE","targetChainId":42161,"reason":"...","confidence":85}
```

If the LLM call fails (timeout, bad JSON, rate limit), a deterministic fallback uses pure APY comparison.

---

## Architecture

```
src/
├── app/
│   ├── api/
│   │   ├── agent/route.ts          # Guardian API
│   │   └── yield-agent/route.ts    # Yielder API
│   ├── globals.css                 # All styling (CSS vars + component classes)
│   ├── layout.tsx
│   └── page.tsx
│
├── components/
│   ├── shared/
│   │   ├── Dashboard.tsx           # Dual-mode layout, polls active API every 2s
│   │   ├── Sidebar.tsx             # Yielder/Guardian tabs + LIVE/SIMULATION toggle
│   │   ├── Providers.tsx
│   │   └── WalletButton.tsx
│   ├── guardian/
│   │   ├── AgentPanel.tsx
│   │   ├── ControlPanel.tsx
│   │   ├── StatsCards.tsx
│   │   ├── TickChart.tsx           # Recharts tick movement chart
│   │   ├── RiskGauge.tsx           # Animated risk score gauge
│   │   ├── ActivityLog.tsx         # Terminal-style log viewer
│   │   └── EvacuationPanel.tsx
│   └── yield/
│       ├── YieldAgentPanel.tsx     # Balance, allocation, fund agent widget
│       ├── YieldDepositWidget.tsx  # MetaMask → agent wallet USDC transfer
│       ├── YieldTable.tsx          # 10-protocol yield scanner table
│       ├── YieldControlPanel.tsx   # Start/stop/reset + mode banner
│       ├── YieldStatsCards.tsx     # Balance, APY, chain, move count
│       └── YieldMoveHistory.tsx    # Simulated vs live move history with tx links
│
├── lib/
│   ├── shared/
│   │   ├── config.ts               # Chain configs, USDC + Aave + Compound addresses
│   │   ├── wagmi.ts                # wagmi (MetaMask only, multiInjectedProviderDiscovery: false)
│   │   └── lifiClient.ts           # LI.FI SDK singleton — reinits on chain change
│   ├── guardian/
│   │   ├── agent.ts                # Guardian polling loop
│   │   ├── monitor.ts              # Uniswap V3 tick monitoring
│   │   ├── executor.ts             # decreaseLiquidity + collect + LI.FI bridge
│   │   └── llm.ts                  # EVACUATE/WAIT/PARTIAL decisions
│   ├── yield/
│   │   ├── yieldAgent.ts           # Main loop — scan → detect position → decide → execute
│   │   ├── yieldScanner.ts         # DeFiLlama USDC yield scanner (60s cache)
│   │   ├── aaveDepositor.ts        # Aave V3 supply/withdraw
│   │   ├── compoundDepositor.ts    # Compound V3 Comet supply/withdraw
│   │   ├── yieldBridge.ts          # LI.FI bridge (fetchQuoteCost / getDryRunQuote / executeBridge)
│   │   └── yieldLlm.ts             # MOVE/STAY/WITHDRAW decision engine
│   └── abi/
│       ├── aaveV3Pool.ts
│       ├── compoundV3Comet.ts
│       ├── uniswapV3Pool.ts
│       └── nonfungiblePositionManager.ts
│
└── types/index.ts
```

---

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript 5 |
| Styling | Tailwind CSS v4 (all via `globals.css`) |
| Fonts | Space Grotesk + JetBrains Mono |
| Wallet | wagmi v3 + viem v2 + MetaMask |
| Bridging | LI.FI SDK v3 (`getQuote` + `convertQuoteToRoute` + `executeRoute`) |
| Yield Data | DeFiLlama API |
| LLM | OpenRouter (`nvidia/nemotron-3-nano-30b-a3b:free`) |
| RPC | Alchemy (writes) |
| MEV Protection | Flashbots Protect RPC (Guardian) |
| Package Manager | bun |

---

## Environment Variables

```env
# Agent Wallet
PRIVATE_KEY=0x...

# Guardian Mode
RPC_URL=https://rpc.flashbots.net
POOL_ADDRESS=0xd0b53D9277642d899DF5C87A3966A349A798F224
POSITION_NFT_ID=123456
TICK_LOWER=-887220
TICK_UPPER=887220
RISK_THRESHOLD=500
POLL_INTERVAL_MS=30000
TARGET_CHAIN_ID=8453
TARGET_ADDRESS=0x...

# LI.FI
LIFI_INTEGRATOR=brahma

# OpenRouter
OPENROUTER_API_KEY=sk-or-v1-...
NEXT_PUBLIC_OPENROUTER_API_KEY=sk-or-v1-...
NEXT_PUBLIC_OPENROUTER_MODEL=nvidia/nemotron-3-nano-30b-a3b:free
```

---

## Getting Started

```bash
git clone <repo-url>
cd brahma
bun install
cp .env.example .env.local
# fill in PRIVATE_KEY, OPENROUTER_API_KEY
bun dev
```

Open [http://localhost:3000](http://localhost:3000).

**Agent wallet requirements:**
- Small amount of ETH on Base, Arbitrum, Optimism + POL on Polygon for gas
- USDC on at least one chain to start hunting

---

## API Reference

### `GET /api/yield-agent`
Returns current `YieldAgentState`.

### `POST /api/yield-agent`

| Action | Body | Description |
|---|---|---|
| `start` | `{ action: "start" }` | Start yield hunting loop |
| `stop` | `{ action: "stop" }` | Stop the loop |
| `reset` | `{ action: "reset" }` | Reset all state |
| `set-mode` | `{ action: "set-mode", mode: "DRY_RUN" \| "LIVE" }` | Switch execution mode |
| `set-allocation` | `{ action: "set-allocation", amount: string }` | Cap managed USDC amount |
| `fetch-balances` | `{ action: "fetch-balances" }` | Force immediate balance refresh |

### `GET /api/agent` / `POST /api/agent`

| Action | Description |
|---|---|
| `start` | Start Guardian monitoring |
| `stop` | Stop monitoring |
| `reset` | Reset state |
| `simulate` | Inject simulated risk score for testing |

---

## Design

- **Theme:** `#070709` background · `#18181B` surfaces · `#E1C4E9` accent purple · `#00FFE0` neon cyan · `#FF2D78` neon pink
- **Typography:** Space Grotesk (UI) + JetBrains Mono (numbers, addresses, logs)
- All styles in `src/app/globals.css` — no inline Tailwind utilities

---

Built for the **LI.FI Vibeathon** — autonomous cross-chain DeFi powered by LI.FI SDK.
