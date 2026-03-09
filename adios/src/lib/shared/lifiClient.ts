import { createWalletClient, http, type Chain } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet, base, arbitrum, optimism, polygon } from "viem/chains";
import { createConfig, EVM } from "@lifi/sdk";
import { YIELD_CHAINS } from "./config";

const CHAIN_MAP: Record<number, Chain> = {
  1: mainnet,
  8453: base,
  42161: arbitrum,
  10: optimism,
  137: polygon,
};

// Track both key and source chain — re-init if either changes
let configuredKey: string | null = null;
let configuredChainId: number | null = null;

export function initLiFi(privateKey: string, sourceChainId: number) {
  const normalizedKey = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;

  // Skip if same key AND same source chain
  if (configuredKey === normalizedKey && configuredChainId === sourceChainId) return;

  const account = privateKeyToAccount(normalizedKey as `0x${string}`);
  const sourceChain = CHAIN_MAP[sourceChainId];
  if (!sourceChain) throw new Error(`initLiFi: unsupported source chain ${sourceChainId}`);
  const sourceTxRpc = YIELD_CHAINS[sourceChainId]?.txRpcUrl;
  if (!sourceTxRpc) throw new Error(`initLiFi: no txRpcUrl for chain ${sourceChainId}`);

  createConfig({
    integrator: process.env.LIFI_INTEGRATOR || "adios",
    providers: [
      EVM({
        getWalletClient: async () =>
          createWalletClient({
            account,
            chain: sourceChain,
            transport: http(sourceTxRpc),
          }),
        switchChain: async (targetChainId: number) => {
          const targetChain = CHAIN_MAP[targetChainId];
          if (!targetChain) throw new Error(`LI.FI switchChain: unsupported chain ${targetChainId}`);
          const txRpc = YIELD_CHAINS[targetChainId]?.txRpcUrl;
          if (!txRpc) throw new Error(`LI.FI switchChain: no txRpcUrl for chain ${targetChainId}`);
          return createWalletClient({
            account,
            chain: targetChain,
            transport: http(txRpc),
          });
        },
      }),
    ],
  });

  configuredKey = normalizedKey;
  configuredChainId = sourceChainId;
}
