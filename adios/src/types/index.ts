export interface PositionData {
  tokenId: string;
  token0: string;
  token1: string;
  token0Symbol: string;
  token1Symbol: string;
  tickLower: number;
  tickUpper: number;
  liquidity: string;
  fee: number;
}

export interface PoolState {
  currentTick: number;
  sqrtPriceX96: string;
  observationIndex: number;
  observationCardinality: number;
  feeProtocol: number;
  unlocked: boolean;
}

export interface RiskAssessment {
  positionId: string;
  currentTick: number;
  tickLower: number;
  tickUpper: number;
  distanceToLower: number;
  distanceToUpper: number;
  riskLevel: "SAFE" | "WARNING" | "CRITICAL" | "OUT_OF_RANGE";
  riskScore: number; // 0-100
  timestamp: number;
}

export interface EvacuationResult {
  success: boolean;
  txHash?: string;
  token0Amount?: string;
  token1Amount?: string;
  bridgeRoute?: BridgeRoute;
  error?: string;
  timestamp: number;
}

export interface BridgeRoute {
  fromChainId: number;
  toChainId: number;
  fromToken: string;
  toToken: string;
  fromAmount: string;
  estimatedOutput: string;
  bridgeUsed: string;
  executionTime: number;
}

export interface AgentState {
  status: "IDLE" | "MONITORING" | "EVACUATING" | "BRIDGING" | "ERROR" | "PAUSED";
  lastCheck: number;
  lastRisk: RiskAssessment | null;
  evacuationHistory: EvacuationResult[];
  logs: LogEntry[];
  uptime: number;
  checksPerformed: number;
}

export interface LogEntry {
  id: string;
  timestamp: number;
  level: "INFO" | "WARN" | "ERROR" | "SUCCESS";
  message: string;
  data?: Record<string, unknown>;
}

export type ChainConfig = {
  chainId: number;
  name: string;
  rpcUrl: string;
  privateRpcUrl?: string;
  explorerUrl: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
};

// ─── Yield Hunting Types ───

export interface YieldPool {
  chain: string;
  chainId: number;
  project: string;
  projectLabel: string; // human-readable protocol name
  symbol: string;
  tvlUsd: number;
  apy: number;
  apyReward: number;
  apyTotal: number;
  actionable: boolean; // true = agent can deposit here (Aave V3)
}

export type YieldProtocol = "aave-v3" | "compound-v3";

export interface YieldPosition {
  chainId: number;
  chainName: string;
  protocol: YieldProtocol;
  depositedAmount: string;
  currentApy: number;
  depositTxHash?: string;
  depositTimestamp: number;
}

export type YieldAgentStatus =
  | "IDLE"
  | "SCANNING"
  | "DECIDING"
  | "WITHDRAWING"
  | "BRIDGING"
  | "DEPOSITING"
  | "MONITORING"
  | "ERROR"
  | "PAUSED";

export interface ChainBalance {
  usdc: string;    // raw USDC (6 decimals)
  aToken: string;  // raw aUSDC (6 decimals)
  total: string;   // usdc + aToken
}

export interface YieldAgentState {
  status: YieldAgentStatus;
  mode: "DRY_RUN" | "LIVE";
  currentPosition: YieldPosition | null;
  lastScan: number;
  lastYields: YieldPool[];
  bestYield: YieldPool | null;
  logs: LogEntry[];
  uptime: number;
  scansPerformed: number;
  movesPerformed: number;
  moveHistory: YieldMoveResult[];
  simulatedMoves: YieldMoveResult[];
  liveMoves: YieldMoveResult[];
  walletBalances: Record<number, ChainBalance>; // per-chain balances
  totalBalance: string;    // sum across all chains (raw, 6 decimals)
  allocatedAmount: string; // how much agent is allowed to manage (raw, 6 decimals). "0" = all
  agentAddress: string;    // public address of the agent wallet
}

export interface YieldMoveResult {
  success: boolean;
  fromChain: number;
  toChain: number;
  amountMoved: string;
  bridgeRoute?: BridgeRoute;
  depositTxHash?: string;
  withdrawTxHash?: string;
  newApy: number;
  timestamp: number;
  error?: string;
  dryRun: boolean;
}

export interface YieldLLMDecision {
  action: "MOVE" | "STAY" | "WITHDRAW";
  targetChainId: number;
  reason: string;
  confidence: number;
}
