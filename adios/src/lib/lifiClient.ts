import { createWalletClient, http, type Chain } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet, base, arbitrum, optimism, polygon } from "viem/chains";
import { createConfig, EVM } from "@lifi/sdk";

const CHAIN_MAP: Record<number, Chain> = {
  1: mainnet,
  8453: base,
  42161: arbitrum,
  10: optimism,
  137: polygon,
};

let initialized = false;

export function initLiFi(privateKey: string, defaultChainId: number, rpcUrl?: string) {
  if (initialized) return;

  const account = privateKeyToAccount(
    (privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`) as `0x${string}`
  );

  const chain = CHAIN_MAP[defaultChainId] ?? base;

  createConfig({
    integrator: process.env.LIFI_INTEGRATOR || "adios",
    providers: [
      EVM({
        getWalletClient: async () =>
          createWalletClient({
            account,
            chain,
            transport: http(rpcUrl),
          }),
        switchChain: async (targetChainId: number) => {
          const targetChain = CHAIN_MAP[targetChainId];
          if (!targetChain) throw new Error(`Unsupported chain: ${targetChainId}`);
          return createWalletClient({
            account,
            chain: targetChain,
            transport: http(),
          });
        },
      }),
    ],
  });

  initialized = true;
}
