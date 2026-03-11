"use client";

import { useState } from "react";
import type { YieldPool, YieldAgentState } from "@/types";

export default function YieldTable({
  state,
  bootstrapYields = [],
  yieldsLoading = false,
  yieldsError = null,
}: {
  state: YieldAgentState;
  bootstrapYields?: YieldPool[];
  yieldsLoading?: boolean;
  yieldsError?: string | null;
}) {
  const yields = state.lastYields.length > 0 ? state.lastYields : bootstrapYields;
  const currentChainId = state.currentPosition?.chainId;
  const currentProject = state.currentPosition ? "aave-v3" : null;
  const bestYield = state.bestYield;
  const [open, setOpen] = useState(true);

  const actionableCount = yields.filter((y) => y.actionable).length;

  return (
    <div className="card">
      {/* Collapsible header */}
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 20px",
          background: "none",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h3 className="chart-heading" style={{ margin: 0 }}>Yield Scanner</h3>
          {yields.length > 0 && (
            <span style={{
              fontSize: 10,
              fontFamily: "var(--font-mono)",
              color: "var(--text-muted)",
              background: "var(--bg-base)",
              border: "1px solid var(--border)",
              borderRadius: 99,
              padding: "1px 8px",
            }}>
              {yields.length} pools · {actionableCount} actionable
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="jp-label">Yield Scanner</span>
          <span style={{
            fontSize: 10,
            color: "var(--text-muted)",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.2s",
            display: "inline-block",
          }}>▼</span>
        </div>
      </button>

      {open && (
        <div style={{ padding: "0 20px 20px" }}>
          <div className="jp-divider" style={{ marginBottom: 12 }} />

          {yields.length === 0 ? (
            <div className="evac-empty">
              {yieldsError
                ? `⚠ ${yieldsError}`
                : yieldsLoading
                ? "Fetching yields from DeFiLlama…"
                : "No yield data available"}
            </div>
          ) : (
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
                    <tr
                      key={`${y.project}-${y.chainId}-${i}`}
                      className={`yield-row ${rowClass} ${!y.actionable ? "view-only" : ""}`}
                    >
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
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
                        {y.tvlUsd >= 1e9
                          ? `$${(y.tvlUsd / 1e9).toFixed(1)}B`
                          : `$${(y.tvlUsd / 1e6).toFixed(1)}M`}
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
          )}
        </div>
      )}
    </div>
  );
}
