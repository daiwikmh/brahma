import { http, createConfig } from "wagmi";
import { mainnet, base, arbitrum, optimism, polygon } from "wagmi/chains";
import { injected } from "wagmi/connectors";

export const wagmiConfig = createConfig({
  ssr: true,
  chains: [base, arbitrum, optimism, polygon, mainnet],
  connectors: [injected({ target: "metaMask" })],
  multiInjectedProviderDiscovery: false, // Only MetaMask — no Keplr, Talisman, etc.
  transports: {
    [mainnet.id]: http(),
    [base.id]: http("https://base-mainnet.g.alchemy.com/v2/JtggWORoKiMdZdf8W5fOD"),
    [arbitrum.id]: http("https://arb-mainnet.g.alchemy.com/v2/JtggWORoKiMdZdf8W5fOD"),
    [optimism.id]: http("https://opt-mainnet.g.alchemy.com/v2/JtggWORoKiMdZdf8W5fOD"),
    [polygon.id]: http("https://polygon-mainnet.g.alchemy.com/v2/JtggWORoKiMdZdf8W5fOD"),
  },
});
