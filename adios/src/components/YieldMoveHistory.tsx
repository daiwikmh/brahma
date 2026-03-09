"use client";

import { ArrowRight, CheckCircle, XCircle } from "lucide-react";
import type { YieldMoveResult } from "@/types";
import { YIELD_CHAINS } from "@/lib/config";

export default function YieldMoveHistory({ moves }: { moves: YieldMoveResult[] }) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="chart-heading">Move History</h3>
        <span className="jp-label">移動履歴</span>
      </div>
      <div className="jp-divider" />

      {moves.length === 0 ? (
        <div className="evac-empty">No moves yet. Agent will bridge when better yield is found.</div>
      ) : (
        <div className="space-y-2">
          {moves.map((m, i) => {
            const from = YIELD_CHAINS[m.fromChain]?.name ?? "?";
            const to = YIELD_CHAINS[m.toChain]?.name ?? "?";

            return (
              <div key={i} className={`move-row ${m.dryRun ? "dry-run" : ""}`}>
                <div className="flex items-center gap-3">
                  {m.success
                    ? <CheckCircle className="w-4 h-4" style={{ color: m.dryRun ? "var(--neon-pink)" : "var(--success)" }} />
                    : <XCircle className="w-4 h-4" style={{ color: "var(--danger)" }} />
                  }
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="evac-chain">{from}</span>
                      <ArrowRight className="w-3 h-3" style={{ color: "var(--neon-cyan)" }} />
                      <span className="evac-chain">{to}</span>
                      {m.dryRun && <span className="yield-tag" style={{ background: "var(--neon-pink-ghost)", color: "var(--neon-pink)" }}>DRY</span>}
                    </div>
                    <p className="evac-meta">
                      {m.bridgeRoute?.bridgeUsed ?? "same-chain"} | {m.newApy.toFixed(2)}% APY
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="evac-time">{new Date(m.timestamp).toLocaleTimeString()}</p>
                  <p style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--neon-cyan-dim)" }}>
                    ${(Number(m.amountMoved) / 1e6).toFixed(4)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
