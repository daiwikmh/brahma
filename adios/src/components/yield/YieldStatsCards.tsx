"use client";

import type { YieldAgentState } from "@/types";
import { YIELD_CHAINS } from "@/lib/shared/config";

export default function YieldStatsCards({ state }: { state: YieldAgentState }) {
  const pos = state.currentPosition;
  const isDryRun = state.mode === "DRY_RUN";
  const totalUsd = Number(state.totalBalance ?? "0") / 1e6;

  // Count chains with any balance
  const activeChains = Object.entries(state.walletBalances ?? {}).filter(
    ([, b]) => Number(b.total) > 0
  ).length;

  // Best actionable APY available
  const bestApy = state.bestYield?.apyTotal;

  const statusClass =
    state.status === "MONITORING" || state.status === "SCANNING"
      ? "val-neon"
      : state.status === "BRIDGING"
        ? "val-warning"
        : ["IDLE", "PAUSED"].includes(state.status)
          ? "val-muted"
          : "val-danger";

  const stats = [
    {
      label: "Total Balance",
      value: totalUsd > 0 ? `$${totalUsd.toFixed(4)}` : "—",
      sub: "USDC across chains",
      color: totalUsd > 0 ? "val-neon" : "val-muted",
      glow: totalUsd > 0 ? "glow-neon" : "",
    },
    {
      label: "Current APY",
      value: pos ? `${pos.currentApy.toFixed(2)}%` : "—",
      sub: pos ? pos.chainName : "not deposited",
      color: pos ? "val-neon" : "val-muted",
      glow: pos ? "glow-neon" : "",
    },
    {
      label: "Best APY",
      value: bestApy ? `${bestApy.toFixed(2)}%` : "—",
      sub: state.bestYield ? `Aave V3 · ${state.bestYield.chain}` : "scanning...",
      color: bestApy ? "val-warning" : "val-muted",
      glow: "",
    },
    {
      label: "Chains",
      value: activeChains > 0 ? `${activeChains} / ${Object.keys(YIELD_CHAINS).length}` : "—",
      sub: "with balance",
      color: activeChains > 0 ? "val-neon" : "val-muted",
      glow: "",
    },
    {
      label: "Moves",
      value: state.movesPerformed.toString(),
      sub: isDryRun ? `${state.simulatedMoves?.length ?? 0} sim` : `${state.liveMoves?.length ?? 0} live`,
      color: state.movesPerformed > 0 ? "val-warning" : "val-muted",
      glow: "",
    },
  ];

  return (
    <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
      {stats.map((s) => (
        <div key={s.label} className={`stat-card ${s.glow}`}>
          <div className="stat-label">
            <span>{s.label}</span>
          </div>
          <p className={`stat-value truncate ${s.color}`}>{s.value}</p>
          {s.sub && (
            <p style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 2, fontFamily: "var(--font-mono)", letterSpacing: "0.02em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {s.sub}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
