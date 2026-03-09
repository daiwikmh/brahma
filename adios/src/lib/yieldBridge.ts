import { getRoutes, executeRoute } from "@lifi/sdk";
import { initLiFi } from "./lifiClient";
import { YIELD_CHAINS } from "./config";
import type { BridgeRoute, LogEntry } from "@/types";

export class YieldBridge {
  private address: string;
  private onLog: (log: Omit<LogEntry, "id">) => void;

  constructor(
    privateKey: string,
    address: string,
    onLog?: (log: Omit<LogEntry, "id">) => void
  ) {
    // Ensure LI.FI SDK is initialized (idempotent)
    initLiFi(privateKey, 8453);
    this.address = address;
    this.onLog = onLog ?? (() => {});
  }

  private log(level: LogEntry["level"], message: string) {
    this.onLog({ timestamp: Date.now(), level, message });
  }

  /**
   * Dry run — get a LI.FI quote without executing.
   */
  async getQuote(
    fromChainId: number,
    toChainId: number,
    amount: bigint
  ): Promise<{
    estimatedOutput: string;
    bridgeName: string;
    estimatedTime: number;
  }> {
    const from = YIELD_CHAINS[fromChainId];
    const to = YIELD_CHAINS[toChainId];
    if (!from || !to) throw new Error("Unsupported chain pair");

    this.log("INFO", `[DRY RUN] Quoting LI.FI: ${from.name} → ${to.name} | ${(Number(amount) / 1e6).toFixed(4)} USDC`);

    const routesRes = await getRoutes({
      fromChainId,
      toChainId,
      fromTokenAddress: from.usdc,
      toTokenAddress: to.usdc,
      fromAmount: amount.toString(),
      fromAddress: this.address,
    });

    const route = routesRes.routes[0];
    if (!route) throw new Error("LI.FI found no routes");

    const step = route.steps[0];
    const bridgeName = step?.toolDetails?.name ?? "aggregated";

    this.log(
      "SUCCESS",
      `[DRY RUN] Route via ${bridgeName} — est. output: ${(Number(route.toAmount) / 1e6).toFixed(4)} USDC`
    );

    return {
      estimatedOutput: route.toAmount ?? "0",
      bridgeName,
      estimatedTime: step?.estimate?.executionDuration ?? 60,
    };
  }

  /**
   * Live — bridge USDC cross-chain via LI.FI.
   */
  async executeBridge(
    fromChainId: number,
    toChainId: number,
    amount: bigint
  ): Promise<BridgeRoute> {
    const from = YIELD_CHAINS[fromChainId];
    const to = YIELD_CHAINS[toChainId];
    if (!from || !to) throw new Error("Unsupported chain pair");

    this.log("INFO", `Bridging ${(Number(amount) / 1e6).toFixed(4)} USDC: ${from.name} → ${to.name} via LI.FI`);

    const routesRes = await getRoutes({
      fromChainId,
      toChainId,
      fromTokenAddress: from.usdc,
      toTokenAddress: to.usdc,
      fromAmount: amount.toString(),
      fromAddress: this.address,
    });

    const route = routesRes.routes[0];
    if (!route) throw new Error("LI.FI found no routes");

    const step = route.steps[0];
    const bridgeName = step?.toolDetails?.name ?? "aggregated";
    this.log("SUCCESS", `LI.FI route via ${bridgeName}`);

    const start = Date.now();

    await executeRoute(route, {
      updateRouteHook: (updated) => {
        const s = updated.steps?.[0];
        if (s?.execution?.status) {
          this.log("INFO", `Bridge: ${s.execution.status}`);
        }
      },
    });

    const elapsed = Date.now() - start;
    this.log("SUCCESS", `Bridge complete — ${elapsed}ms`);

    return {
      fromChainId,
      toChainId,
      fromToken: from.usdc,
      toToken: to.usdc,
      fromAmount: amount.toString(),
      estimatedOutput: route.toAmount ?? "0",
      bridgeUsed: bridgeName,
      executionTime: elapsed,
    };
  }
}
