import type { ChainConfig } from "@/types";

export const SUPPORTED_CHAINS: Record<number, ChainConfig> = {
  1: {
    chainId: 1,
    name: "Ethereum",
    rpcUrl: "https://eth.llamarpc.com",
    privateRpcUrl: "https://rpc.flashbots.net",
    explorerUrl: "https://etherscan.io",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  },
  42161: {
    chainId: 42161,
    name: "Arbitrum",
    rpcUrl: "https://arb1.arbitrum.io/rpc",
    explorerUrl: "https://arbiscan.io",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  },
  8453: {
    chainId: 8453,
    name: "Base",
    rpcUrl: "https://base-mainnet.g.alchemy.com/v2/JtggWORoKiMdZdf8W5fOD",
    explorerUrl: "https://basescan.org",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  },
  10: {
    chainId: 10,
    name: "Optimism",
    rpcUrl: "https://mainnet.optimism.io",
    explorerUrl: "https://optimistic.etherscan.io",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  },
  137: {
    chainId: 137,
    name: "Polygon",
    rpcUrl: "https://polygon-mainnet.g.alchemy.com/v2/JtggWORoKiMdZdf8W5fOD",
    explorerUrl: "https://polygonscan.com",
    nativeCurrency: { name: "MATIC", symbol: "MATIC", decimals: 18 },
  },
  11155111: {
    chainId: 11155111,
    name: "Sepolia",
    rpcUrl:
      process.env.RPC_URL ||
      "https://eth-sepolia.g.alchemy.com/v2/9elNFLtsKnZj21x7IiwjX",
    explorerUrl: "https://sepolia.etherscan.io",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  },
};

export const WELL_KNOWN_TOKENS: Record<
  string,
  { address: string; symbol: string; decimals: number; chainId: number }
> = {
  WETH_ETH: {
    address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    symbol: "WETH",
    decimals: 18,
    chainId: 1,
  },
  USDC_ETH: {
    address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    symbol: "USDC",
    decimals: 6,
    chainId: 1,
  },
  WETH_BASE: {
    address: "0x4200000000000000000000000000000000000006",
    symbol: "WETH",
    decimals: 18,
    chainId: 8453,
  },
  USDC_BASE: {
    address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    symbol: "USDC",
    decimals: 6,
    chainId: 8453,
  },
  WETH_ARB: {
    address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
    symbol: "WETH",
    decimals: 18,
    chainId: 42161,
  },
  USDC_ARB: {
    address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    symbol: "USDC",
    decimals: 6,
    chainId: 42161,
  },
};

// WETH/USDC 0.05% pool on Base
export const DEFAULT_POOL_ADDRESS =
  process.env.POOL_ADDRESS || "0xd0b53D9277642d899DF5C87A3966A349A798F224";

export const DEFAULT_RISK_THRESHOLD = 500;
export const DEFAULT_POLL_INTERVAL = 60_000;

// ─── Yield Hunting Config ───

export const YIELD_CHAINS: Record<
  number,
  {
    chainId: number;
    name: string;
    usdc: `0x${string}`;
    aavePool: `0x${string}`;
    aToken: `0x${string}`;
    // Compound V3 Comet USDC market address
    // Source: https://github.com/compound-finance/comet/tree/main/deployments
    compoundComet: `0x${string}`;
    rpcUrl: string;    // public RPC — for reads, balance checks, dry-run simulations
    txRpcUrl: string;  // Alchemy — for writes (approve, supply, withdraw, bridge)
  }
> = {
  8453: {
    chainId: 8453,
    name: "Base",
    usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    aavePool: "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5",
    aToken: "0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB",
    compoundComet: "0xb125E6687d4313864e53df431d5425969c15Eb2F",
    rpcUrl: "https://base-mainnet.g.alchemy.com/v2/JtggWORoKiMdZdf8W5fOD",
    txRpcUrl: "https://base-mainnet.g.alchemy.com/v2/JtggWORoKiMdZdf8W5fOD",
  },
  42161: {
    chainId: 42161,
    name: "Arbitrum",
    usdc: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    aavePool: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
    aToken: "0x724dc807b04555b71ed48a6896b6F41593b8C637",
    compoundComet: "0x9c4ec768c28520B50860ea7a15bd7213a9fF58bf",
    rpcUrl: "https://arb-mainnet.g.alchemy.com/v2/JtggWORoKiMdZdf8W5fOD",
    txRpcUrl: "https://arb-mainnet.g.alchemy.com/v2/JtggWORoKiMdZdf8W5fOD",
  },
  10: {
    chainId: 10,
    name: "Optimism",
    usdc: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
    aavePool: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
    aToken: "0x38d693cE1dF5AaDF7bC62043aE5EF4e45a3d37Bd",
    compoundComet: "0x2e44e174f7D53F0212823acC11C01A11d58c5bCB",
    rpcUrl: "https://opt-mainnet.g.alchemy.com/v2/JtggWORoKiMdZdf8W5fOD",
    txRpcUrl: "https://opt-mainnet.g.alchemy.com/v2/JtggWORoKiMdZdf8W5fOD",
  },
  137: {
    chainId: 137,
    name: "Polygon",
    usdc: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
    aavePool: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
    aToken: "0xA4D94019934D8333Ef880ABFFbF2FDd611C762BD",
    compoundComet: "0xF25212E676D1F7F89Cd72fFEe66158f541246445",
    rpcUrl: "https://polygon-mainnet.g.alchemy.com/v2/JtggWORoKiMdZdf8W5fOD",
    txRpcUrl: "https://polygon-mainnet.g.alchemy.com/v2/JtggWORoKiMdZdf8W5fOD",
  },
};

export const DEFI_LLAMA_CHAIN_MAP: Record<number, string> = {
  8453: "Base",
  42161: "Arbitrum",
  10: "Optimism",
  137: "Polygon",
};

export const DEFAULT_YIELD_POLL_INTERVAL = 60_000; // 1 min
export const MIN_APY_DIFF_TO_MOVE = 2.0; // 2% APY diff threshold
