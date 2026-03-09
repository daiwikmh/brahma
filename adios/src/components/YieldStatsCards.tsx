"use client";

import { TrendingUp, Globe, DollarSign, Radio, ArrowRightLeft, Eye } from "lucide-react";
import type { YieldAgentState } from "@/types";

export default function YieldStatsCards({ state }: { state: YieldAgentState }) {
  const pos = state.currentPosition;
  const isDryRun = state.mode === "DRY_RUN";

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
      icon: Eye,
      label: "Status",
      value: state.status,
      color: statusClass,
      glow: state.status === "SCANNING" ? "glow-neon" : "",
    },
    {
      icon: Globe,
      label: "Chain",
      value: pos?.chainName ?? "—",
      color: pos ? "val-neon" : "val-muted",
      glow: "",
    },
    {
      icon: TrendingUp,
      label: "APY",
      value: pos ? `${pos.currentApy.toFixed(2)}%` : "—",
      color: pos ? "val-neon" : "val-muted",
      glow: pos ? "glow-neon" : "",
    },
    {
      icon: DollarSign,
      label: "Deposited",
      value: pos ? `$${(Number(pos.depositedAmount) / 1e6).toFixed(4)}` : "—",
      color: pos ? "val-primary" : "val-muted",
      glow: "",
    },
    {
      icon: Radio,
      label: "Scans",
      value: state.scansPerformed.toString(),
      color: "val-neon",
      glow: "",
    },
    {
      icon: ArrowRightLeft,
      label: "Moves",
      value: `${state.movesPerformed}${isDryRun ? " (dry)" : ""}`,
      color: state.movesPerformed > 0 ? "val-warning" : "val-muted",
      glow: "",
    },
  ];

  return (
    <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
      {stats.map((s) => (
        <div key={s.label} className={`stat-card ${s.glow}`}>
          <div className="stat-label">
            <s.icon />
            <span>{s.label}</span>
          </div>
          <p className={`stat-value truncate ${s.color}`}>{s.value}</p>
        </div>
      ))}
    </div>
  );
}
