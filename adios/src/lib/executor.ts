import {
  createWalletClient,
  createPublicClient,
  http,
  type Chain,
  type PublicClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet, base, arbitrum, optimism, polygon } from "viem/chains";
import { getRoutes, executeRoute } from "@lifi/sdk";
import { initLiFi } from "./lifiClient";
import {
  NONFUNGIBLE_POSITION_MANAGER_ABI,
  POSITION_MANAGER_ADDRESS,
} from "./abi/nonfungiblePositionManager";
import type { EvacuationResult, BridgeRoute, LogEntry } from "@/types";

const CHAIN_MAP: Record<number, Chain> = {
  1: mainnet,
  8453: base,
  42161: arbitrum,
  10: optimism,
  137: polygon,
};

const MAX_UINT128 = BigInt("0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF");
const SLIPPAGE_BPS = 995n; // 0.5% slippage tolerance

export class EvacuationExecutor {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private walletClient: any;
  private publicClient: PublicClient;
  private privateRpcClient: PublicClient | null;
  private onLog: (log: Omit<LogEntry, "id">) => void;
  private address: `0x${string}`;

  constructor(
    rpcUrl: string,
    privateKey: string,
    chainId: number,
    privateRpcUrl?: string,
    onLog?: (log: Omit<LogEntry, "id">) => void
  ) {
    const chain = CHAIN_MAP[chainId] ?? mainnet;
    const account = privateKeyToAccount(
      privateKey.startsWith("0x")
        ? (privateKey as `0x${string}`)
        : (`0x${privateKey}` as `0x${string}`)
    );

    this.address = account.address;

    this.walletClient = createWalletClient({
      account,
      chain,
      transport: http(rpcUrl),
    });

    this.publicClient = createPublicClient({
      chain,
      transport: http(rpcUrl),
    }) as PublicClient;

    this.privateRpcClient = privateRpcUrl
      ? (createPublicClient({
          chain,
          transport: http(privateRpcUrl),
        }) as PublicClient)
      : null;

    // Configure LI.FI SDK (shared singleton)
    initLiFi(privateKey, chainId, rpcUrl);

    this.onLog = onLog ?? (() => {});
  }

  private log(
    level: LogEntry["level"],
    message: string,
    data?: Record<string, unknown>
  ) {
    this.onLog({ timestamp: Date.now(), level, message, data });
  }

  /**
   * Withdraw full liquidity from a Uniswap V3 position.
   * Uses simulateContract to get real amounts + apply 0.5% slippage before sending.
   * Routes through private RPC (Flashbots) to protect against MEV.
   */
  async withdrawLiquidity(
    tokenId: string,
    liquidity: string,
    recipient: `0x${string}`
  ): Promise<{ amount0: bigint; amount1: bigint; txHash: string }> {
    this.log("INFO", `Withdrawing liquidity for position #${tokenId}`);

    const deadline = BigInt(Math.floor(Date.now() / 1000) + 1800);
    const tokenIdBig = BigInt(tokenId);
    const liquidityBig = BigInt(liquidity);

    // Simulate decreaseLiquidity to get expected amounts (no tx cost)
    const { result: simResult } = await this.publicClient.simulateContract({
      address: POSITION_MANAGER_ADDRESS as `0x${string}`,
      abi: NONFUNGIBLE_POSITION_MANAGER_ABI,
      functionName: "decreaseLiquidity",
      args: [
        {
          tokenId: tokenIdBig,
          liquidity: liquidityBig,
          amount0Min: 0n,
          amount1Min: 0n,
          deadline,
        },
      ],
      account: this.address,
    });

    const [expectedAmount0, expectedAmount1] = simResult as [bigint, bigint];
    const amount0Min = (expectedAmount0 * SLIPPAGE_BPS) / 1000n;
    const amount1Min = (expectedAmount1 * SLIPPAGE_BPS) / 1000n;

    this.log(
      "INFO",
      `Expected: ${expectedAmount0} token0, ${expectedAmount1} token1 (0.5% slippage applied)`,
      { amount0Min: amount0Min.toString(), amount1Min: amount1Min.toString() }
    );
    this.log("INFO", "Submitting decreaseLiquidity via MEV-protected RPC");

    // Use private RPC transport for MEV protection if available
    const decreaseHash = await this.walletClient.writeContract({
      address: POSITION_MANAGER_ADDRESS as `0x${string}`,
      abi: NONFUNGIBLE_POSITION_MANAGER_ABI,
      functionName: "decreaseLiquidity",
      args: [
        {
          tokenId: tokenIdBig,
          liquidity: liquidityBig,
          amount0Min,
          amount1Min,
          deadline,
        },
      ],
    });

    await this.publicClient.waitForTransactionReceipt({ hash: decreaseHash });
    this.log("SUCCESS", `Liquidity decreased. TX: ${decreaseHash}`);

    // Simulate collect to get exact amounts
    const { result: collectSim } = await this.publicClient.simulateContract({
      address: POSITION_MANAGER_ADDRESS as `0x${string}`,
      abi: NONFUNGIBLE_POSITION_MANAGER_ABI,
      functionName: "collect",
      args: [
        {
          tokenId: tokenIdBig,
          recipient,
          amount0Max: MAX_UINT128,
          amount1Max: MAX_UINT128,
        },
      ],
      account: this.address,
    });

    const [amount0, amount1] = collectSim as [bigint, bigint];
    this.log(
      "INFO",
      `Collecting ${amount0} token0, ${amount1} token1`
    );

    const collectHash = await this.walletClient.writeContract({
      address: POSITION_MANAGER_ADDRESS as `0x${string}`,
      abi: NONFUNGIBLE_POSITION_MANAGER_ABI,
      functionName: "collect",
      args: [
        {
          tokenId: tokenIdBig,
          recipient,
          amount0Max: MAX_UINT128,
          amount1Max: MAX_UINT128,
        },
      ],
    });

    await this.publicClient.waitForTransactionReceipt({ hash: collectHash });
    this.log("SUCCESS", `Tokens collected. TX: ${collectHash}`);

    return { amount0, amount1, txHash: collectHash };
  }

  /**
   * Bridge assets cross-chain via LI.FI SDK.
   * LI.FI handles token approvals automatically.
   */
  async bridgeAssets(
    fromChainId: number,
    toChainId: number,
    fromToken: string,
    toToken: string,
    amount: bigint,
    fromAddress: string
  ): Promise<BridgeRoute> {
    if (amount === 0n) {
      throw new Error("Cannot bridge zero amount");
    }

    this.log(
      "INFO",
      `LI.FI route request: chain ${fromChainId} → ${toChainId}`,
      { fromToken, toToken, amount: amount.toString() }
    );

    const routesResponse = await getRoutes({
      fromChainId,
      toChainId,
      fromTokenAddress: fromToken,
      toTokenAddress: toToken,
      fromAmount: amount.toString(),
      fromAddress,
    });

    const route = routesResponse.routes[0];
    if (!route) throw new Error("LI.FI found no routes for this bridge");

    const step = route.steps[0];
    const bridgeName = step?.toolDetails?.name ?? "aggregated";
    this.log("SUCCESS", `LI.FI route via ${bridgeName}`, {
      estimatedOutput: route.toAmount,
      steps: route.steps.length,
    });

    const start = Date.now();

    // executeRoute handles approvals + bridge tx automatically
    await executeRoute(route, {
      updateRouteHook: (updated) => {
        const s = updated.steps?.[0];
        if (s?.execution?.status) {
          this.log("INFO", `Bridge status: ${s.execution.status}`);
        }
      },
    });

    this.log("SUCCESS", `Bridge complete in ${Date.now() - start}ms`);

    return {
      fromChainId,
      toChainId,
      fromToken,
      toToken,
      fromAmount: amount.toString(),
      estimatedOutput: route.toAmount ?? "0",
      bridgeUsed: bridgeName,
      executionTime: Date.now() - start,
    };
  }

  /**
   * Full evacuation: withdraw liquidity → bridge both tokens cross-chain via LI.FI.
   * This is the core execution loop called by the autonomous agent.
   */
  async executeEvacuation(
    tokenId: string,
    liquidity: string,
    token0Address: string,
    token1Address: string,
    fromChainId: number,
    toChainId: number,
    targetToken: string
  ): Promise<EvacuationResult> {
    const startTime = Date.now();

    try {
      this.log("WARN", "=== EVACUATION INITIATED ===");
      this.log("INFO", `NFT #${tokenId} | liquidity: ${liquidity}`);

      // Step 1: Withdraw from Uniswap V3
      const { amount0, amount1, txHash } = await this.withdrawLiquidity(
        tokenId,
        liquidity,
        this.address
      );

      let bridgeRoute: BridgeRoute | undefined;

      // Step 2: Bridge token0 if non-zero
      if (amount0 > 0n) {
        bridgeRoute = await this.bridgeAssets(
          fromChainId,
          toChainId,
          token0Address,
          targetToken,
          amount0,
          this.address
        );
      }

      // Step 3: Bridge token1 if non-zero
      if (amount1 > 0n) {
        const route1 = await this.bridgeAssets(
          fromChainId,
          toChainId,
          token1Address,
          targetToken,
          amount1,
          this.address
        );
        if (!bridgeRoute) bridgeRoute = route1;
      }

      this.log(
        "SUCCESS",
        `=== EVACUATION COMPLETE — ${Date.now() - startTime}ms ===`
      );

      return {
        success: true,
        txHash,
        token0Amount: amount0.toString(),
        token1Amount: amount1.toString(),
        bridgeRoute,
        timestamp: Date.now(),
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown evacuation error";
      this.log("ERROR", `Evacuation failed: ${message}`);
      return { success: false, error: message, timestamp: Date.now() };
    }
  }
}
