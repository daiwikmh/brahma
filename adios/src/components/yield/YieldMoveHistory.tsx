"use client";

import { useState, useEffect } from "react";
import { ArrowRight, CheckCircle, XCircle } from "lucide-react";
import type { YieldAgentState, YieldMoveResult } from "@/types";
import { YIELD_CHAINS } from "@/lib/shared/config";

const EXPLORER: Record<number, string> = {
  8453: "https://basescan.org/tx/",
  42161: "https://arbiscan.io/tx/",
  10: "https://optimistic.etherscan.io/tx/",
  137: "https://polygonscan.com/tx/",
};

function TxLink({ hash, chainId, label }: { hash: string; chainId: number; label: string }) {
  const base = EXPLORER[chainId] ?? "https://etherscan.io/tx/";
  return (
    <a
      href={`${base}${hash}`}
      target="_blank"
      rel="noopener noreferrer"
      style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--neon-cyan)", textDecoration: "none", display: "block" }}
    >
      {label}: {hash.slice(0, 8)}...{hash.slice(-6)} ↗
    </a>
  );
}

function MoveRow({ m }: { m: YieldMoveResult }) {
  const from = YIELD_CHAINS[m.fromChain]?.name ?? "?";
  const to = YIELD_CHAINS[m.toChain]?.name ?? "?";

  return (
    <div className={`move-row ${m.dryRun ? "dry-run" : ""}`}>
      <div className="flex items-center gap-3" style={{ minWidth: 0 }}>
        {m.success
          ? <CheckCircle className="w-4 h-4 shrink-0" style={{ color: m.dryRun ? "var(--neon-pink)" : "var(--success)" }} />
          : <XCircle className="w-4 h-4 shrink-0" style={{ color: "var(--danger)" }} />
        }
        <div style={{ minWidth: 0 }}>
          <div className="flex items-center gap-2">
            <span className="evac-chain">{from}</span>
            <ArrowRight className="w-3 h-3" style={{ color: "var(--neon-cyan)" }} />
            <span className="evac-chain">{to}</span>
            {m.dryRun && (
              <span className="yield-tag" style={{ background: "var(--neon-pink-ghost)", color: "var(--neon-pink)" }}>
                SIM
              </span>
            )}
          </div>
          <p className="evac-meta">
            {m.bridgeRoute?.bridgeUsed ?? "same-chain"} | {m.newApy.toFixed(2)}% APY
          </p>
          {!m.dryRun && (
            <div className="mt-1 space-y-0.5">
              {m.withdrawTxHash && <TxLink hash={m.withdrawTxHash} chainId={m.fromChain} label="Withdraw" />}
              {m.depositTxHash && <TxLink hash={m.depositTxHash} chainId={m.toChain} label="Deposit" />}
            </div>
          )}
        </div>
      </div>
      <div className="text-right shrink-0">
        <p className="evac-time">{new Date(m.timestamp).toLocaleTimeString()}</p>
        <p style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--neon-cyan-dim)" }}>
          ${(Number(m.amountMoved) / 1e6).toFixed(4)}
          {m.dryRun && <span style={{ color: "var(--text-muted)" }}> (sim)</span>}
        </p>
      </div>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="evac-empty">{label}</div>
  );
}

export default function YieldMoveHistory({ state }: { state: YieldAgentState }) {
  const simMoves = state.simulatedMoves ?? state.moveHistory?.filter((m) => m.dryRun) ?? [];
  const liveMoves = state.liveMoves ?? state.moveHistory?.filter((m) => !m.dryRun) ?? [];

  const [tab, setTab] = useState<"simulated" | "live">("simulated");

  // Auto-switch to whichever tab has entries
  useEffect(() => {
    if (liveMoves.length > 0) setTab("live");
    else if (simMoves.length > 0) setTab("simulated");
  }, [liveMoves.length, simMoves.length]);

  const shown = tab === "simulated" ? simMoves : liveMoves;

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="chart-heading">Move History</h3>
        <span className="jp-label">Move Log</span>
      </div>
      <div className="jp-divider" />

      {/* Tab switcher */}
      <div className="flex gap-1 mb-4" style={{ background: "var(--bg-base)", borderRadius: 8, padding: 3 }}>
        <button
          onClick={() => setTab("simulated")}
          className="flex items-center gap-1.5"
          style={{
            flex: 1,
            padding: "5px 10px",
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 500,
            border: "none",
            cursor: "pointer",
            background: tab === "simulated" ? "var(--neon-pink-ghost)" : "transparent",
            color: tab === "simulated" ? "var(--neon-pink)" : "var(--text-muted)",
            borderColor: tab === "simulated" ? "var(--neon-pink-muted)" : "transparent",
            borderWidth: 1,
            borderStyle: "solid",
            transition: "all 0.15s",
          }}
        >
          Simulated
          {simMoves.length > 0 && (
            <span style={{
              background: "var(--neon-pink)",
              color: "#000",
              borderRadius: 99,
              fontSize: 9,
              padding: "1px 5px",
              fontWeight: 700,
            }}>
              {simMoves.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab("live")}
          className="flex items-center gap-1.5"
          style={{
            flex: 1,
            padding: "5px 10px",
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 500,
            border: "none",
            cursor: "pointer",
            background: tab === "live" ? "var(--neon-cyan-ghost)" : "transparent",
            color: tab === "live" ? "var(--neon-cyan)" : "var(--text-muted)",
            borderColor: tab === "live" ? "var(--neon-cyan-muted)" : "transparent",
            borderWidth: 1,
            borderStyle: "solid",
            transition: "all 0.15s",
          }}
        >
          Live
          {liveMoves.length > 0 && (
            <span style={{
              background: "var(--neon-cyan)",
              color: "#000",
              borderRadius: 99,
              fontSize: 9,
              padding: "1px 5px",
              fontWeight: 700,
            }}>
              {liveMoves.length}
            </span>
          )}
        </button>
      </div>

      {shown.length === 0 ? (
        <EmptyState
          label={
            tab === "simulated"
              ? "No simulations yet. Start agent in DRY RUN mode."
              : "No live moves yet. Switch to LIVE mode to execute real transactions."
          }
        />
      ) : (
        <div className="space-y-2">
          {[...shown].reverse().map((m, i) => (
            <MoveRow key={i} m={m} />
          ))}
        </div>
      )}
    </div>
  );
}
