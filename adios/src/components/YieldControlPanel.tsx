"use client";

import { Play, Square, RotateCcw, Eye, Zap, Radio } from "lucide-react";
import type { YieldAgentState } from "@/types";

export default function YieldControlPanel({
  state,
  onAction,
}: {
  state: YieldAgentState;
  onAction: (action: string, data?: Record<string, unknown>) => void;
}) {
  const isRunning = !["IDLE", "PAUSED", "ERROR"].includes(state.status);
  const isDryRun = state.mode === "DRY_RUN";

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="control-heading" style={{ marginBottom: 0 }}>Agent Control</h3>
        <span className="jp-label">エージェント制御</span>
      </div>

      {/* Mode banner */}
      <div className={`mode-banner ${isDryRun ? "dry-run" : "live-mode"} mb-3`}>
        {isDryRun ? <Eye className="w-3.5 h-3.5" /> : <Zap className="w-3.5 h-3.5" />}
        {isDryRun ? "DRY RUN — no transactions" : "LIVE — real transactions"}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {!isRunning ? (
          <button
            onClick={() => onAction("start", { mode: state.mode })}
            className="btn btn-neon col-span-2"
          >
            <Play className="w-3.5 h-3.5" /> Start Yield Agent
          </button>
        ) : (
          <button onClick={() => onAction("stop")} className="btn btn-stop col-span-2">
            <Square className="w-3.5 h-3.5" /> Stop Agent
          </button>
        )}

        <button onClick={() => onAction("reset")} className="btn btn-ghost">
          <RotateCcw className="w-3 h-3" /> Reset
        </button>

        <button
          onClick={() =>
            onAction("set-mode", { mode: isDryRun ? "LIVE" : "DRY_RUN" })
          }
          className={`btn ${isDryRun ? "btn-neon-pink" : "btn-neon"}`}
        >
          <Radio className="w-3 h-3" />
          {isDryRun ? "Go LIVE" : "Dry Run"}
        </button>
      </div>

      <div className="powered-by mt-4">
        <p className="powered-by-label">Powered by</p>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <div className="lifi-badge">Li</div>
            <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>LI.FI Cross-chain</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="lifi-badge" style={{ background: "linear-gradient(135deg, #2563eb, #7c3aed)" }}>Av</div>
            <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>Aave V3 Yield</span>
          </div>
        </div>
      </div>
    </div>
  );
}
