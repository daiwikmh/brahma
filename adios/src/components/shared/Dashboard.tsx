"use client";

import { useState, useEffect, useCallback } from "react";
import {
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";
import Sidebar from "./Sidebar";
import AgentPanel from "../guardian/AgentPanel";
import StatsCards from "../guardian/StatsCards";
import TickChart from "../guardian/TickChart";
import RiskGauge from "../guardian/RiskGauge";
import ActivityLog from "../guardian/ActivityLog";
import ControlPanel from "../guardian/ControlPanel";
import EvacuationPanel from "../guardian/EvacuationPanel";
import YieldStatsCards from "../yield/YieldStatsCards";
import YieldTable from "../yield/YieldTable";
import YieldControlPanel from "../yield/YieldControlPanel";
import YieldMoveHistory from "../yield/YieldMoveHistory";
import YieldAgentPanel from "../yield/YieldAgentPanel";
import type { AgentState, YieldAgentState } from "@/types";

const INITIAL_GUARDIAN: AgentState = {
  status: "IDLE",
  lastCheck: 0,
  lastRisk: null,
  evacuationHistory: [],
  logs: [],
  uptime: 0,
  checksPerformed: 0,
};

const INITIAL_YIELD: YieldAgentState = {
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
  simulatedMoves: [],
  liveMoves: [],
  walletBalances: {},
  totalBalance: "0",
  allocatedAmount: "0",
  agentAddress: "",
};

export default function Dashboard() {
  const [guardianState, setGuardianState] = useState<AgentState>(INITIAL_GUARDIAN);
  const [yieldState, setYieldState] = useState<YieldAgentState>(INITIAL_YIELD);
  const [activeNav, setActiveNav] = useState("dashboard");
  const [mode, setMode] = useState<"guardian" | "yield">("yield");
  const [simulationMode, setSimulationMode] = useState<"DRY_RUN" | "LIVE">("DRY_RUN");
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);

  const handleSimulationModeChange = useCallback(
    async (newMode: "DRY_RUN" | "LIVE") => {
      setSimulationMode(newMode);
      try {
        await fetch("/api/yield-agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "set-mode", mode: newMode }),
        });
      } catch { /* silent */ }
    },
    []
  );

  // Poll only the active mode, pause when tab is hidden
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;

    const endpoint = mode === "yield" ? "/api/yield-agent" : "/api/agent";
    const setter = mode === "yield" ? setYieldState : setGuardianState;

    const poll = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch(endpoint);
        if (res.ok) setter(await res.json());
      } catch { /* silent */ }
    };

    poll();
    interval = setInterval(poll, 2000);

    const onVisibility = () => {
      if (!document.hidden) poll();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      if (interval) clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [mode]);

  const handleGuardianAction = useCallback(
    async (action: string, data?: Record<string, unknown>) => {
      try {
        await fetch("/api/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, ...data }),
        });
      } catch (err) {
        console.error("Action failed:", err);
      }
    },
    []
  );

  const handleYieldAction = useCallback(
    async (action: string, data?: Record<string, unknown>) => {
      try {
        await fetch("/api/yield-agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, ...data }),
        });
      } catch (err) {
        console.error("Action failed:", err);
      }
    },
    []
  );

  const isYield = mode === "yield";
  const currentStatus = isYield ? yieldState.status : guardianState.status;

  const statusClass = (() => {
    if (isYield) {
      if (["SCANNING", "MONITORING"].includes(currentStatus)) return "scanning";
      if (currentStatus === "BRIDGING") return "bridging";
      if (currentStatus === "ERROR") return "alert";
      return "idle";
    }
    if (currentStatus === "MONITORING") return "live";
    if (["EVACUATING", "BRIDGING"].includes(currentStatus)) return "alert";
    return "idle";
  })();

  return (
    <div className="flex h-screen overflow-y-auto overflow-x-hidden" style={{ background: "var(--bg-deep)", color: "var(--text-primary)" }}>
      {leftOpen && (
        <Sidebar
          active={activeNav}
          onNavigate={setActiveNav}
          mode={mode}
          onModeChange={(m) => { setMode(m); setActiveNav("dashboard"); }}
          simulationMode={simulationMode}
          onSimulationModeChange={handleSimulationModeChange}
        />
      )}

      <main className="flex-1 min-w-0 transition-all duration-300" style={{ marginLeft: leftOpen ? 220 : 0 }}>
        <header className="topbar">
          <div className="flex items-center gap-3">
            <button onClick={() => setLeftOpen(!leftOpen)} className="icon-btn">
              {leftOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
            </button>
            <div>
              <h2 className="topbar-title">{isYield ? "Yield Hunter" : "Guardian"}</h2>
              <p className="topbar-sub">
                {isYield ? "adios — Cross-Chain Yield" : "adios — Autonomous LP Guardian"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="status-badge">
              <div className={`status-dot ${statusClass}`} />
              <span>{currentStatus}</span>
            </div>
            <button onClick={() => setRightOpen(!rightOpen)} className="icon-btn">
              {rightOpen ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
            </button>
          </div>
        </header>

        <div className="p-6 space-y-4">
          {isYield ? (
            <>
              <YieldStatsCards state={yieldState} />
              <YieldTable state={yieldState} />
              <div className="grid grid-cols-3 gap-4">
                <YieldControlPanel state={yieldState} onAction={handleYieldAction} />
                <div className="col-span-2">
                  <ActivityLog logs={yieldState.logs} />
                </div>
              </div>
              <YieldMoveHistory state={yieldState} />
            </>
          ) : (
            <>
              <StatsCards state={guardianState} />
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2">
                  <TickChart risk={guardianState.lastRisk} />
                </div>
                <RiskGauge risk={guardianState.lastRisk} />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <ControlPanel state={guardianState} onAction={handleGuardianAction} />
                <div className="col-span-2">
                  <ActivityLog logs={guardianState.logs} />
                </div>
              </div>
              <EvacuationPanel evacuations={guardianState.evacuationHistory} />
            </>
          )}
        </div>
      </main>

      {rightOpen && (
        <aside className="w-[320px] shrink-0 card m-3 ml-0 self-start sticky top-3">
          {isYield ? (
            <YieldAgentPanel state={yieldState} onAction={handleYieldAction} />
          ) : (
            <AgentPanel state={guardianState} />
          )}
        </aside>
      )}
    </div>
  );
}
