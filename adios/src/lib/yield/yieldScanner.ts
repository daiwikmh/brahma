import { DEFI_LLAMA_CHAIN_MAP } from "../shared/config";
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

// Lower = more preferred. Polygon (137) is least preferred.
const CHAIN_PREFERENCE: Record<number, number> = {
  8453: 1,  // Base
  42161: 2, // Arbitrum
  10: 3,    // Optimism
  137: 4,   // Polygon
};

let cache: { data: YieldPool[]; ts: number } | null = null;

export async function scanYields(): Promise<YieldPool[]> {
  if (cache && Date.now() - cache.ts < CACHE_TTL) return cache.data;

  // DeFiLlama returns ~5-10MB of all pools — give it enough time, retry once on timeout
  let res: Response | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      res = await fetch(DEFI_LLAMA_URL, {
        signal: AbortSignal.timeout(45000),
        cache: "no-store",
      });
      if (res.ok) break;
    } catch (e) {
      console.warn(`[yieldScanner] attempt ${attempt + 1} failed:`, e);
      if (attempt === 1) throw e;
    }
  }

  if (!res || !res.ok) {
    throw new Error(`DeFiLlama API ${res?.status ?? "timeout"}`);
  }

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
  const actionable = pools.filter((p) => p.actionable);
  if (actionable.length === 0) return null;
  actionable.sort((a, b) => b.apyTotal - a.apyTotal);
  return actionable[0];
}

export function shouldMove(
  currentChainId: number | null,
  best: YieldPool,
  currentApy: number,
  minDiff: number
): boolean {
  if (currentChainId === null) return true; // not deposited anywhere
  if (best.chainId === currentChainId) return false; // already on best chain
  // Always move away from Polygon if a preferred chain has equal or better APY
  if (currentChainId === 137 && (CHAIN_PREFERENCE[best.chainId] ?? 99) < (CHAIN_PREFERENCE[137])) return true;
  return best.apyTotal - currentApy >= minDiff;
}
