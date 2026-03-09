"use client";

import {
  Activity,
  BarChart3,
  Shield,
  Settings,
  Zap,
  Radio,
  TrendingUp,
  Globe,
  ArrowRightLeft,
  type LucideIcon,
} from "lucide-react";
import WalletButton from "./WalletButton";

const GUARDIAN_NAV: { icon: LucideIcon; label: string; id: string }[] = [
  { icon: Activity, label: "Dashboard", id: "dashboard" },
  { icon: Radio, label: "Monitor", id: "monitor" },
  { icon: Shield, label: "Positions", id: "positions" },
  { icon: Zap, label: "Evacuations", id: "evacuations" },
  { icon: Settings, label: "Settings", id: "settings" },
];

const YIELD_NAV: { icon: LucideIcon; label: string; id: string }[] = [
  { icon: Activity, label: "Dashboard", id: "dashboard" },
  { icon: Globe, label: "Scanner", id: "scanner" },
  { icon: TrendingUp, label: "Position", id: "position" },
  { icon: ArrowRightLeft, label: "History", id: "history" },
  { icon: Settings, label: "Settings", id: "settings" },
];

export default function Sidebar({
  active,
  onNavigate,
  mode,
  onModeChange,
}: {
  active: string;
  onNavigate: (id: string) => void;
  mode: "guardian" | "yield";
  onModeChange: (mode: "guardian" | "yield") => void;
}) {
  const navItems = mode === "guardian" ? GUARDIAN_NAV : YIELD_NAV;
  const isYield = mode === "yield";

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-header">
        <div className="flex items-center gap-3">
          <div className="sidebar-logo" style={isYield ? { background: "var(--neon-cyan-ghost)", borderColor: "var(--neon-cyan-muted)" } : {}}>
            <span style={isYield ? { color: "var(--neon-cyan)" } : {}}>a</span>
          </div>
          <div>
            <h1 className="sidebar-title">adios</h1>
            <p className="sidebar-subtitle" style={isYield ? { color: "var(--neon-cyan-dim)" } : {}}>
              {isYield ? "Yield Hunter" : "LP Guardian"}
            </p>
          </div>
        </div>
      </div>

      {/* Mode tabs */}
      <div className="mode-tabs">
        <button
          className={`mode-tab ${mode === "guardian" ? "active-guardian" : ""}`}
          onClick={() => onModeChange("guardian")}
        >
          <Shield /> Guardian
        </button>
        <button
          className={`mode-tab ${mode === "yield" ? "active-yield" : ""}`}
          onClick={() => onModeChange("yield")}
        >
          <TrendingUp /> Yield
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-0.5">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className={`nav-item ${
              active === item.id
                ? isYield
                  ? "active-yield"
                  : "active"
                : ""
            }`}
          >
            <item.icon className="w-4 h-4" />
            {item.label}
          </button>
        ))}
      </nav>

      {/* Wallet */}
      <div style={{ borderTop: "1px solid var(--border)" }}>
        <WalletButton />
      </div>

      {/* Bottom info */}
      <div className="mev-shield" style={isYield ? { background: "var(--neon-cyan-ghost)", borderColor: "rgba(0,255,224,0.08)" } : {}}>
        {isYield ? (
          <>
            <p className="mev-shield-title" style={{ color: "var(--neon-cyan-dim)" }}>Cross-Chain Yield</p>
            <p className="mev-shield-text">Scanning Aave V3 yields on Base, Arbitrum, Optimism via DeFiLlama.</p>
            <div className="mt-2 flex items-center gap-1.5">
              <div className="mev-dot" style={{ background: "var(--neon-cyan)" }} />
              <span className="text-[10px]" style={{ color: "var(--neon-cyan)" }}>Scanning</span>
            </div>
          </>
        ) : (
          <>
            <p className="mev-shield-title">MEV Shield</p>
            <p className="mev-shield-text">Flashbots Protect RPC active. Shielded from frontrunning.</p>
            <div className="mt-2 flex items-center gap-1.5">
              <div className="mev-dot" />
              <span className="text-[10px]" style={{ color: "var(--success)" }}>Protected</span>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
