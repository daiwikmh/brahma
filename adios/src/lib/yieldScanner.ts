import { DEFI_LLAMA_CHAIN_MAP } from "./config";
import type { YieldPool } from "@/types";

const DEFI_LLAMA_URL = "https://yields.llama.fi/pools";
const CACHE_TTL = 60_000; // 1 min cache

// Protocols the agent can actually deposit into (Aave V3 only)
const ACTIONABLE_PROJECTS = new Set(["aave-v3"]);

// All protocols worth scanning for UI richness
const SCAN_PROJECTS = new Set([
  "aave-v3",
  "compound-v3",
  "morpho-blue",
  "morpho",
  "moonwell",
  "seamless-protocol",
  "fluid",
  "spark",
  "euler",
  "ionic-protocol",
]);

const PROJECT_LABELS: Record<string, string> = {
  "aave-v3": "Aave V3",
  "compound-v3": "Compound V3",
  "morpho-blue": "Morpho Blue",
  "morpho": "Morpho",
  "moonwell": "Moonwell",
  "seamless-protocol": "Seamless",
  "fluid": "Fluid",
  "spark": "Spark",
  "euler": "Euler",
  "ionic-protocol": "Ionic",
};

let cache: { data: YieldPool[]; ts: number } | null = null;

export async function scanYields(): Promise<YieldPool[]> {
  if (cache && Date.now() - cache.ts < CACHE_TTL) return cache.data;

  const res = await fetch(DEFI_LLAMA_URL, {
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) throw new Error(`DeFiLlama API ${res.status}`);

  const json = await res.json();
  const pools: YieldPool[] = [];

  const chainNames = new Set(Object.values(DEFI_LLAMA_CHAIN_MAP));
  const chainIdLookup: Record<string, number> = {};
  for (const [id, name] of Object.entries(DEFI_LLAMA_CHAIN_MAP)) {
    chainIdLookup[name] = Number(id);
  }

  for (const p of json.data) {
    if (
      SCAN_PROJECTS.has(p.project) &&
      (p.symbol === "USDC" || p.symbol === "USDC.E" || p.symbol === "USDC.e") &&
      chainNames.has(p.chain)
    ) {
      const apyTotal = (p.apyBase ?? 0) + (p.apyReward ?? 0);
      // Skip dust pools < $100k TVL
      if ((p.tvlUsd ?? 0) < 100_000) continue;

      pools.push({
        chain: p.chain,
        chainId: chainIdLookup[p.chain],
        project: p.project,
        projectLabel: PROJECT_LABELS[p.project] ?? p.project,
        symbol: p.symbol,
        tvlUsd: p.tvlUsd ?? 0,
        apy: p.apyBase ?? 0,
        apyReward: p.apyReward ?? 0,
        apyTotal,
        actionable: ACTIONABLE_PROJECTS.has(p.project),
      });
    }
  }

  // Sort by total APY descending
  pools.sort((a, b) => b.apyTotal - a.apyTotal);

  cache = { data: pools, ts: Date.now() };
  return pools;
}

export function getBestYield(pools: YieldPool[]): YieldPool | null {
  // Agent only moves to actionable pools
  const actionable = pools.filter((p) => p.actionable);
  return actionable.length > 0 ? actionable[0] : null;
}

export function shouldMove(
  currentChainId: number | null,
  best: YieldPool,
  currentApy: number,
  minDiff: number
): boolean {
  if (currentChainId === null) return true; // not deposited anywhere
  if (best.chainId === currentChainId) return false; // already on best chain
  return best.apyTotal - currentApy >= minDiff;
}
