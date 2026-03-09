"use client";

import { Bot, Wifi, WifiOff, TrendingUp } from "lucide-react";
import type { YieldAgentState } from "@/types";

export default function YieldAgentPanel({ state }: { state: YieldAgentState }) {
  const isLive = !["IDLE", "PAUSED", "ERROR"].includes(state.status);

  return (
    <div className="agent-panel">
      {/* Header */}
      <div className="agent-header">
        <div className="agent-icon" style={{ background: "var(--neon-cyan-ghost)" }}>
          <Bot style={{ color: "var(--neon-cyan)" }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="agent-name">Yield Agent</p>
          <p className="agent-role">イールド・ハンター</p>
        </div>
        <div className="agent-status">
          {isLive
            ? <Wifi className="w-3 h-3" style={{ color: "var(--neon-cyan)" }} />
            : <WifiOff className="w-3 h-3" style={{ color: "var(--text-muted)" }} />
          }
          <span style={{ color: isLive ? "var(--neon-cyan)" : "var(--text-muted)" }}>
            {isLive ? "Live" : "Off"}
          </span>
        </div>
      </div>

      {/* Hanko stamp */}
      <div className="flex justify-center">
        <div className="hanko">収益</div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-2">
        <div className="metric-card">
          <p className="metric-label">Scans</p>
          <p className="metric-value">{state.scansPerformed}</p>
        </div>
        <div className="metric-card">
          <p className="metric-label">Moves</p>
          <p className="metric-value">{state.movesPerformed}</p>
        </div>
        <div className="metric-card">
          <p className="metric-label">Best APY</p>
          <p className="metric-value" style={{ color: state.bestYield ? "var(--neon-cyan)" : undefined }}>
            {state.bestYield ? `${state.bestYield.apyTotal.toFixed(2)}%` : "--"}
          </p>
        </div>
        <div className="metric-card">
          <p className="metric-label">Mode</p>
          <p className="metric-value" style={{ color: state.mode === "LIVE" ? "var(--neon-cyan)" : "var(--neon-pink)", fontSize: 12 }}>
            {state.mode}
          </p>
        </div>
      </div>

      {/* Connections */}
      <div className="space-y-1.5">
        <p className="conn-label uppercase tracking-wider">接続 (Connections)</p>
        <ConnRow label="DeFiLlama" value="API" ok />
        <ConnRow label="LI.FI" value="v3.x" ok />
        <ConnRow label="Aave V3" value={isLive ? "Connected" : "Idle"} ok={isLive} />
      </div>

      {/* Current position */}
      {state.currentPosition && (
        <div className="shield-box" style={{ background: "var(--neon-cyan-ghost)", borderColor: "rgba(0,255,224,0.08)" }}>
          <div className="shield-title" style={{ color: "var(--neon-cyan)" }}>
            <TrendingUp /> Active Position
          </div>
          <p className="shield-text">
            {state.currentPosition.chainName} — {state.currentPosition.currentApy.toFixed(2)}% APY
            <br />
            ${(Number(state.currentPosition.depositedAmount) / 1e6).toFixed(4)} USDC
          </p>
        </div>
      )}
    </div>
  );
}

function ConnRow({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="conn-label">{label}</span>
      <span className={`conn-value ${ok ? "ok" : "off"}`}>{value}</span>
    </div>
  );
}
