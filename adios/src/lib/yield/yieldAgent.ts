import { scanYields, getBestYield, shouldMove } from "./yieldScanner";
import { AaveDepositor } from "./aaveDepositor";
import { YieldBridge } from "./yieldBridge";
import { getYieldDecision } from "./yieldLlm";
import { YIELD_CHAINS, MIN_APY_DIFF_TO_MOVE } from "../shared/config";
import { privateKeyToAccount } from "viem/accounts";
import type { YieldAgentState, LogEntry, YieldPool, ChainBalance } from "@/types";

let state: YieldAgentState = {
  status: "IDLE",
  mode: "DRY_RUN",
  currentPosition: null,
  lastScan: 0,
  lastYields: [],
  bestYield: null,
  logs: [],
  uptime: 0,
  scansPerformed: 0,
  movesPerformed: 0,
  moveHistory: [],
  simulatedMoves: [],
  liveMoves: [],
  walletBalances: {},
  totalBalance: "0",
  allocatedAmount: "0",
  agentAddress: "",
};

let agentPrivateKey: string | null = null;
let lastBalanceRefresh = 0;
const BALANCE_REFRESH_INTERVAL = 120_000; // 2 min minimum between refreshes

async function refreshBalances() {
  if (Date.now() - lastBalanceRefresh < BALANCE_REFRESH_INTERVAL) return;
  lastBalanceRefresh = Date.now();
  if (!agentPrivateKey) return;
  const balances: Record<number, ChainBalance> = {};
  let total = 0n;
  for (const chainId of Object.keys(YIELD_CHAINS).map(Number)) {
    try {
      const dep = new AaveDepositor(agentPrivateKey, chainId);
      const usdc = await dep.getUsdcBalance();
      const aToken = await dep.getATokenBalance();
      const chainTotal = usdc + aToken;
      balances[chainId] = {
        usdc: usdc.toString(),
        aToken: aToken.toString(),
        total: chainTotal.toString(),
      };
      total += chainTotal;
    } catch {
      balances[chainId] = { usdc: "0", aToken: "0", total: "0" };
    }
  }
  state.walletBalances = balances;
  state.totalBalance = total.toString();
}

let interval: ReturnType<typeof setInterval> | null = null;

function addLog(entry: Omit<LogEntry, "id">) {
  const log: LogEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ...entry,
  };
  state.logs = [log, ...state.logs].slice(0, 200);
}

export function getYieldAgentState(): YieldAgentState {
  return { ...state };
}

export function resetYieldAgent() {
  if (interval) clearInterval(interval);
  interval = null;
  state = {
    status: "IDLE",
    mode: state.mode,
    currentPosition: null,
    lastScan: 0,
    lastYields: [],
    bestYield: null,
    logs: [],
    uptime: 0,
    scansPerformed: 0,
    movesPerformed: 0,
    moveHistory: [],
    simulatedMoves: [],
    liveMoves: [],
    walletBalances: state.walletBalances,
    totalBalance: state.totalBalance,
    allocatedAmount: state.allocatedAmount,
    agentAddress: state.agentAddress,
  };
}

export function setAllocation(amountUsdc: string) {
  // amountUsdc is a human-readable string like "1.5", stored as raw 6-decimal bigint string
  const raw = BigInt(Math.round(parseFloat(amountUsdc) * 1_000_000)).toString();
  state.allocatedAmount = raw;
  addLog({
    timestamp: Date.now(),
    level: "INFO",
    message: `Allocation set to ${parseFloat(amountUsdc).toFixed(4)} USDC`,
  });
}

export async function fetchAgentBalances() {
  lastBalanceRefresh = 0; // bypass throttle for manual refresh
  await refreshBalances();
}

export function setYieldMode(mode: "DRY_RUN" | "LIVE") {
  state.mode = mode;
  addLog({
    timestamp: Date.now(),
    level: "WARN",
    message: `Mode switched to ${mode}${mode === "LIVE" ? " — real transactions enabled" : ""}`,
  });
}

export function startYieldAgent(config: {
  privateKey: string;
  pollIntervalMs: number;
  mode: "DRY_RUN" | "LIVE";
}) {
  if (state.status === "SCANNING" || state.status === "BRIDGING" || state.status === "DEPOSITING") {
    addLog({ timestamp: Date.now(), level: "WARN", message: "Agent already running" });
    return;
  }

  agentPrivateKey = config.privateKey;
  state.mode = config.mode;
  state.status = "MONITORING";
  state.uptime = Date.now();
  state.agentAddress = privateKeyToAccount(
    (config.privateKey.startsWith("0x") ? config.privateKey : `0x${config.privateKey}`) as `0x${string}`
  ).address;

  // Fetch balances immediately on start
  refreshBalances().catch(() => {});

  const account = privateKeyToAccount(
    (config.privateKey.startsWith("0x") ? config.privateKey : `0x${config.privateKey}`) as `0x${string}`
  );
  const address = account.address;

  const bridge = new YieldBridge(config.privateKey, address, (l) => addLog(l));

  addLog({
    timestamp: Date.now(),
    level: "INFO",
    message: `brahma yield agent started [${config.mode}] — scanning every ${config.pollIntervalMs / 1000}s`,
  });
  addLog({
    timestamp: Date.now(),
    level: "INFO",
    message: `Agent wallet: ${address.slice(0, 8)}...${address.slice(-4)}`,
  });

  const runCycle = async () => {
    if (["BRIDGING", "DEPOSITING", "WITHDRAWING"].includes(state.status)) return;

    try {
      // ── SCAN ──
      state.status = "SCANNING";
      addLog({ timestamp: Date.now(), level: "INFO", message: "Scanning USDC yields across chains..." });

      // Refresh wallet balances in background
      refreshBalances().catch(() => {});

      const yields: YieldPool[] = await scanYields();
      state.lastYields = yields;
      state.lastScan = Date.now();
      state.scansPerformed++;

      const actionableYields = yields.filter((y) => y.actionable);
      const best = getBestYield(yields);
      state.bestYield = best;

      if (!best) {
        addLog({ timestamp: Date.now(), level: "WARN", message: "No actionable yield data from DeFiLlama" });
        state.status = "MONITORING";
        return;
      }

      // Log only actionable (Aave V3) pools in agent log
      for (const y of actionableYields) {
        const isCurrent = state.currentPosition?.chainId === y.chainId;
        const isBest = y.chainId === best.chainId;
        const tag = isCurrent ? " ← CURRENT" : isBest ? " ★ BEST" : "";
        addLog({
          timestamp: Date.now(),
          level: "INFO",
          message: `  [Aave V3] ${y.chain}: ${y.apyTotal.toFixed(2)}% APY | TVL $${(y.tvlUsd / 1e6).toFixed(1)}M${tag}`,
        });
      }

      // ── DETECT ACTUAL ON-CHAIN AAVE POSITION ──
      // If currentPosition is unset or stale, scan all chains for real aToken balance
      if (!state.currentPosition) {
        for (const chainId of Object.keys(YIELD_CHAINS).map(Number)) {
          try {
            const dep = new AaveDepositor(config.privateKey, chainId);
            const aToken = await dep.getATokenBalance();
            if (aToken > 1000n) { // >$0.001 — ignore dust
              const pool = actionableYields.find((y) => y.chainId === chainId);
              state.currentPosition = {
                chainId,
                chainName: YIELD_CHAINS[chainId].name,
                protocol: "aave-v3",
                depositedAmount: aToken.toString(),
                currentApy: pool?.apyTotal ?? 0,
                depositTimestamp: Date.now(),
              };
              addLog({ timestamp: Date.now(), level: "INFO", message: `Detected existing Aave position: ${(Number(aToken) / 1e6).toFixed(4)} aUSDC on ${YIELD_CHAINS[chainId].name}` });
              break;
            }
          } catch { /* skip chain */ }
        }
      }

      // Check if move needed
      const currentApy = state.currentPosition?.currentApy ?? 0;
      const currentChainId = state.currentPosition?.chainId ?? null;

      // ── GET REAL BRIDGE QUOTE for LLM context ──
      // Lightweight fetchQuoteCost — no eth_call, just getQuote for cost data
      let bridgeCostForLlm = "unknown";
      if (currentChainId !== null && currentChainId !== best.chainId) {
        try {
          const stateAlloc = BigInt(state.allocatedAmount ?? "0");
          const stateTotal = BigInt(state.totalBalance ?? "0");
          const quoteAmount = stateAlloc > 0n ? stateAlloc : stateTotal > 0n ? stateTotal : BigInt(1_000_000);
          const preQuote = await bridge.fetchQuoteCost(currentChainId, best.chainId, quoteAmount);
          bridgeCostForLlm = `$${preQuote.bridgeCostUsdc.toFixed(4)} USDC via ${preQuote.bridgeName}`;
          addLog({
            timestamp: Date.now(),
            level: "INFO",
            message: `Bridge cost estimate: ${bridgeCostForLlm}`,
          });
        } catch {
          addLog({ timestamp: Date.now(), level: "WARN", message: "Could not fetch bridge quote — LLM will decide without cost data" });
        }
      }

      // ── DECIDE ──
      state.status = "DECIDING";
      addLog({ timestamp: Date.now(), level: "INFO", message: "Consulting AI decision engine..." });

      const decision = await getYieldDecision(
        state.currentPosition,
        actionableYields,
        bridgeCostForLlm
      );

      addLog({
        timestamp: Date.now(),
        level: decision.action === "MOVE" ? "WARN" : "INFO",
        message: `AI Decision: ${decision.action} → ${YIELD_CHAINS[decision.targetChainId]?.name ?? "?"} (${decision.confidence}%) — ${decision.reason}`,
      });

      if (decision.action === "STAY") {
        state.status = "MONITORING";
        return;
      }

      const targetChain = YIELD_CHAINS[decision.targetChainId];
      if (!targetChain) {
        addLog({ timestamp: Date.now(), level: "ERROR", message: `Unknown target chain: ${decision.targetChainId}` });
        state.status = "MONITORING";
        return;
      }

      const dryRun = state.mode === "DRY_RUN";

      // ── WITHDRAW (if deposited somewhere) ──
      let availableAmount: bigint;
      // sourceChainId is resolved here and used in the BRIDGE section below
      let sourceChainId: number = currentChainId ?? 8453;

      // Use allocated amount if set, otherwise full balance
      const allocated = BigInt(state.allocatedAmount ?? "0");
      const DRY_RUN_DEMO_AMOUNT = allocated > 0n ? allocated : 1_000_000n; // default 1 USDC

      let withdrawTxHash: string | undefined;

      if (state.currentPosition && state.currentPosition.chainId !== decision.targetChainId) {
        sourceChainId = state.currentPosition.chainId;
        state.status = "WITHDRAWING";
        const depositor = new AaveDepositor(config.privateKey, sourceChainId, (l) => addLog(l));
        const withdrawResult = await depositor.withdraw(dryRun);
        withdrawTxHash = withdrawResult.txHash;
        availableAmount = withdrawResult.amountReceived;
        // In dry run, use demo amount if no real aToken balance
        if (dryRun && availableAmount === 0n) {
          availableAmount = DRY_RUN_DEMO_AMOUNT;
          addLog({ timestamp: Date.now(), level: "INFO", message: "[DRY RUN] No aToken balance — simulating with 1.0000 USDC" });
        }
      } else {
        // Not deposited — find which chain holds USDC by scanning walletBalances
        if (currentChainId === null) {
          // If balances haven't loaded yet (first cycle), fetch them now before proceeding
          const hasBalanceData = Object.values(state.walletBalances).some(
            (b) => BigInt(b.total ?? "0") > 0n
          );
          if (!hasBalanceData) {
            addLog({ timestamp: Date.now(), level: "INFO", message: "Fetching balances before first move..." });
            await refreshBalances();
            lastBalanceRefresh = Date.now(); // prevent immediate re-fetch
          }

          let maxBalance = 0n;
          for (const [cid, bal] of Object.entries(state.walletBalances)) {
            const total = BigInt(bal.total ?? "0");
            if (total > maxBalance) {
              maxBalance = total;
              sourceChainId = Number(cid);
            }
          }
          if (maxBalance === 0n) {
            addLog({ timestamp: Date.now(), level: "WARN", message: "No USDC balance found on any chain — depositing to best yield chain directly" });
            // No USDC anywhere — target chain is the destination, source doesn't matter
            // Fall through with sourceChainId = decision.targetChainId (same-chain deposit)
            sourceChainId = decision.targetChainId;
          }
        }
        const depositor = new AaveDepositor(config.privateKey, sourceChainId, (l) => addLog(l));
        const rawBalance = await depositor.getUsdcBalance();
        // Cap to allocated amount if set
        availableAmount = allocated > 0n && rawBalance > allocated ? allocated : rawBalance;
        addLog({
          timestamp: Date.now(),
          level: "INFO",
          message: `USDC balance on ${YIELD_CHAINS[sourceChainId]?.name}: ${(Number(rawBalance) / 1e6).toFixed(4)}${allocated > 0n ? ` (allocated: ${(Number(allocated) / 1e6).toFixed(4)})` : ""}`,
        });
        // In dry run, always proceed with demo amount so the full simulation runs
        if (dryRun && availableAmount === 0n) {
          availableAmount = DRY_RUN_DEMO_AMOUNT;
          addLog({ timestamp: Date.now(), level: "INFO", message: "[DRY RUN] No balance — simulating with 1.0000 USDC demo amount" });
        }
      }

      if (availableAmount === 0n) {
        // Only blocks in LIVE mode — in dry run we always have demo amount
        addLog({ timestamp: Date.now(), level: "ERROR", message: "No USDC available to move (switch to DRY RUN to simulate)" });
        state.status = "MONITORING";
        return;
      }

      // ── BRIDGE (if cross-chain) ──
      // fromChainId is resolved from currentPosition or walletBalances — never a hardcoded fallback
      const fromChainId = state.currentPosition?.chainId ?? sourceChainId;
      let bridgeRoute;

      if (fromChainId !== decision.targetChainId) {
        state.status = "BRIDGING";

        if (dryRun) {
          const quote = await bridge.getDryRunQuote(fromChainId, decision.targetChainId, availableAmount);
          addLog({
            timestamp: Date.now(),
            level: "SUCCESS",
            message: `[DRY RUN] Would bridge via ${quote.bridgeName} — est. output: ${(Number(quote.estimatedOutput) / 1e6).toFixed(4)} USDC | fee: ${quote.bridgeCostUsdc.toFixed(4)} USDC`,
          });
          bridgeRoute = {
            fromChainId,
            toChainId: decision.targetChainId,
            fromToken: YIELD_CHAINS[fromChainId].usdc,
            toToken: targetChain.usdc,
            fromAmount: availableAmount.toString(),
            estimatedOutput: quote.estimatedOutput,
            bridgeUsed: quote.bridgeName,
            executionTime: 0,
          };
        } else {
          bridgeRoute = await bridge.executeBridge(fromChainId, decision.targetChainId, availableAmount);
        }
      }

      // ── DEPOSIT ──
      state.status = "DEPOSITING";
      const targetDepositor = new AaveDepositor(config.privateKey, decision.targetChainId, (l) => addLog(l));

      let depositAmount: bigint;
      if (dryRun) {
        depositAmount = availableAmount;
      } else {
        // Verify USDC actually arrived on target chain after bridge
        depositAmount = await targetDepositor.getUsdcBalance();
        if (depositAmount === 0n) {
          addLog({
            timestamp: Date.now(),
            level: "ERROR",
            message: `Bridge completed but no USDC found on ${targetChain.name} — aborting deposit. Check bridge tx manually.`,
          });
          state.status = "MONITORING";
          return;
        }
        addLog({
          timestamp: Date.now(),
          level: "SUCCESS",
          message: `Confirmed ${(Number(depositAmount) / 1e6).toFixed(4)} USDC arrived on ${targetChain.name}`,
        });
      }

      if (depositAmount > 0n) {
        try {
          const depositResult = await targetDepositor.deposit(depositAmount, dryRun);
          if (depositResult.txHash || depositResult.simulated) {
            state.currentPosition = {
              chainId: decision.targetChainId,
              chainName: targetChain.name,
              protocol: "aave-v3",
              depositedAmount: depositAmount.toString(),
              currentApy: best.apyTotal,
              depositTxHash: depositResult.txHash,
              depositTimestamp: Date.now(),
            };
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          addLog({ timestamp: Date.now(), level: "ERROR", message: `Deposit failed: ${msg.slice(0, 120)}` });
        }
      }

      // ── RECORD ──
      state.movesPerformed++;
      const moveRecord = {
        success: true,
        fromChain: fromChainId,
        toChain: decision.targetChainId,
        amountMoved: availableAmount.toString(),
        bridgeRoute,
        withdrawTxHash,
        depositTxHash: state.currentPosition?.depositTxHash,
        newApy: best.apyTotal,
        timestamp: Date.now(),
        dryRun,
      };
      state.moveHistory.push(moveRecord);
      if (dryRun) {
        state.simulatedMoves.push(moveRecord);
      } else {
        state.liveMoves.push(moveRecord);
      }

      addLog({
        timestamp: Date.now(),
        level: "SUCCESS",
        message: `${dryRun ? "[DRY RUN] " : ""}=== Move complete → ${targetChain.name} at ${best.apyTotal.toFixed(2)}% APY ===`,
      });

      state.status = "MONITORING";
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      addLog({ timestamp: Date.now(), level: "ERROR", message: message.slice(0, 200) });
      state.status = "MONITORING";
    }
  };

  runCycle();
  interval = setInterval(runCycle, config.pollIntervalMs);
}

export function stopYieldAgent() {
  if (interval) {
    clearInterval(interval);
    interval = null;
  }
  state.status = "PAUSED";
  addLog({ timestamp: Date.now(), level: "INFO", message: "Yield agent stopped" });
}
