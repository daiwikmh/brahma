import { scanYields, getBestYield, shouldMove } from "./yieldScanner";
import { AaveDepositor } from "./aaveDepositor";
import { YieldBridge } from "./yieldBridge";
import { getYieldDecision } from "./yieldLlm";
import { YIELD_CHAINS, MIN_APY_DIFF_TO_MOVE } from "./config";
import { privateKeyToAccount } from "viem/accounts";
import type { YieldAgentState, LogEntry, YieldPool } from "@/types";

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
};

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
  };
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

  state.mode = config.mode;
  state.status = "MONITORING";
  state.uptime = Date.now();

  const account = privateKeyToAccount(
    (config.privateKey.startsWith("0x") ? config.privateKey : `0x${config.privateKey}`) as `0x${string}`
  );
  const address = account.address;

  const bridge = new YieldBridge(config.privateKey, address, (l) => addLog(l));

  addLog({
    timestamp: Date.now(),
    level: "INFO",
    message: `adios yield agent started [${config.mode}] — scanning every ${config.pollIntervalMs / 1000}s`,
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

      // Check if move needed
      const currentApy = state.currentPosition?.currentApy ?? 0;
      const currentChainId = state.currentPosition?.chainId ?? null;

      if (!shouldMove(currentChainId, best, currentApy, MIN_APY_DIFF_TO_MOVE)) {
        addLog({
          timestamp: Date.now(),
          level: "INFO",
          message: state.currentPosition
            ? `Staying on ${state.currentPosition.chainName} — yield competitive`
            : "No better opportunity found",
        });
        state.status = "MONITORING";
        return;
      }

      // ── DECIDE ──
      state.status = "DECIDING";
      addLog({ timestamp: Date.now(), level: "INFO", message: "Consulting AI decision engine..." });

      const decision = await getYieldDecision(
        state.currentPosition,
        actionableYields,
        "~$0.05"
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

      if (state.currentPosition && state.currentPosition.chainId !== decision.targetChainId) {
        state.status = "WITHDRAWING";
        const depositor = new AaveDepositor(config.privateKey, state.currentPosition.chainId, (l) => addLog(l));
        const withdrawResult = await depositor.withdraw(dryRun);
        availableAmount = withdrawResult.amountReceived;
      } else {
        // Not deposited — check USDC balance on source chain
        const sourceChainId = state.currentPosition?.chainId ?? 8453; // default Base
        const depositor = new AaveDepositor(config.privateKey, sourceChainId, (l) => addLog(l));
        availableAmount = await depositor.getUsdcBalance();
        addLog({
          timestamp: Date.now(),
          level: "INFO",
          message: `USDC balance on ${YIELD_CHAINS[sourceChainId]?.name}: ${(Number(availableAmount) / 1e6).toFixed(4)}`,
        });
      }

      if (availableAmount === 0n) {
        addLog({ timestamp: Date.now(), level: "ERROR", message: "No USDC available to move" });
        state.status = "MONITORING";
        return;
      }

      // ── BRIDGE (if cross-chain) ──
      const fromChainId = state.currentPosition?.chainId ?? 8453;
      let bridgeRoute;

      if (fromChainId !== decision.targetChainId) {
        state.status = "BRIDGING";

        if (dryRun) {
          const quote = await bridge.getQuote(fromChainId, decision.targetChainId, availableAmount);
          addLog({
            timestamp: Date.now(),
            level: "SUCCESS",
            message: `[DRY RUN] Would bridge via ${quote.bridgeName} — est. output: ${(Number(quote.estimatedOutput) / 1e6).toFixed(4)} USDC`,
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

      // After bridge, check balance on target chain
      const depositAmount = dryRun
        ? availableAmount
        : await targetDepositor.getUsdcBalance();

      if (depositAmount > 0n) {
        const depositResult = await targetDepositor.deposit(depositAmount, dryRun);

        state.currentPosition = {
          chainId: decision.targetChainId,
          chainName: targetChain.name,
          aavePool: targetChain.aavePool,
          depositedAmount: depositAmount.toString(),
          currentApy: best.apyTotal,
          depositTxHash: depositResult.txHash,
          depositTimestamp: Date.now(),
        };
      }

      // ── RECORD ──
      state.movesPerformed++;
      state.moveHistory.push({
        success: true,
        fromChain: fromChainId,
        toChain: decision.targetChainId,
        amountMoved: availableAmount.toString(),
        bridgeRoute,
        depositTxHash: state.currentPosition?.depositTxHash,
        newApy: best.apyTotal,
        timestamp: Date.now(),
        dryRun,
      });

      addLog({
        timestamp: Date.now(),
        level: "SUCCESS",
        message: `${dryRun ? "[DRY RUN] " : ""}=== Move complete → ${targetChain.name} at ${best.apyTotal.toFixed(2)}% APY ===`,
      });

      state.status = "MONITORING";
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      addLog({ timestamp: Date.now(), level: "ERROR", message: `Cycle failed: ${message}` });
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
