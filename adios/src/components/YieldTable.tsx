"use client";

import type { YieldPool, YieldAgentState } from "@/types";

export default function YieldTable({ state }: { state: YieldAgentState }) {
  const yields = state.lastYields;
  const currentChainId = state.currentPosition?.chainId;
  const currentProject = state.currentPosition ? "aave-v3" : null;
  const bestYield = state.bestYield;

  if (yields.length === 0) {
    return (
      <div className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="chart-heading">Yield Scanner</h3>
          <span className="jp-label">イールド・スキャナー</span>
        </div>
        <div className="jp-divider" />
        <div className="evac-empty">Start agent to scan yields across chains</div>
      </div>
    );
  }

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="chart-heading">Yield Scanner</h3>
        <div className="flex items-center gap-3">
          <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
            {yields.length} pools · {yields.filter((y) => y.actionable).length} actionable
          </span>
          <span className="jp-label">イールド・スキャナー</span>
        </div>
      </div>
      <div className="jp-divider" />

      <table className="yield-table">
        <thead>
          <tr>
            <th>Protocol</th>
            <th>Chain</th>
            <th>Base APY</th>
            <th>Reward</th>
            <th>Total APY</th>
            <th>TVL</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {yields.map((y, i) => {
            const isCurrent =
              y.chainId === currentChainId && y.project === (currentProject ?? "");
            const isBest =
              bestYield &&
              y.chainId === bestYield.chainId &&
              y.project === bestYield.project &&
              !isCurrent;
            const rowClass = isCurrent ? "current" : isBest ? "best" : "";

            return (
              <tr key={`${y.project}-${y.chainId}-${i}`} className={`yield-row ${rowClass} ${!y.actionable ? "view-only" : ""}`}>
                <td>
                  <div className="flex items-center gap-1.5">
                    <span className="yield-chain-name">{y.projectLabel}</span>
                    {!y.actionable && (
                      <span className="yield-tag" style={{ background: "rgba(255,255,255,0.04)", color: "var(--text-muted)", fontSize: 9 }}>
                        view
                      </span>
                    )}
                  </div>
                </td>
                <td>
                  <span style={{ color: "var(--text-secondary)", fontSize: 12 }}>{y.chain}</span>
                </td>
                <td>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>
                    {y.apy.toFixed(2)}%
                  </span>
                </td>
                <td>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: y.apyReward > 0 ? "var(--neon-pink)" : "var(--text-muted)" }}>
                    {y.apyReward > 0 ? `+${y.apyReward.toFixed(2)}%` : "—"}
                  </span>
                </td>
                <td>
                  <span className={`yield-apy ${isBest ? "neon" : ""}`}>
                    {y.apyTotal.toFixed(2)}%
                  </span>
                </td>
                <td style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
                  ${y.tvlUsd >= 1e9
                    ? `${(y.tvlUsd / 1e9).toFixed(1)}B`
                    : `${(y.tvlUsd / 1e6).toFixed(1)}M`}
                </td>
                <td>
                  {isCurrent && <span className="yield-tag current">Current</span>}
                  {isBest && <span className="yield-tag best">Best</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
