import { defineChain } from "viem";

export const somniaShannon = defineChain({
  id: 50312,
  name: "Somnia Shannon Testnet",
  nativeCurrency: {
    name: "Somnia Test Token",
    symbol: "STT",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_SOMNIA_RPC_URL || "https://dream-rpc.somnia.network"],
    },
  },
  blockExplorers: {
    default: {
      name: "Somnia Shannon Explorer",
      url: process.env.NEXT_PUBLIC_EXPLORER_URL || "https://shannon-explorer.somnia.network",
    },
  },
  testnet: true,
});
