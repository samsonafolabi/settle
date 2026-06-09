import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { somniaShannon } from "@/lib/chains";

export const wagmiConfig = getDefaultConfig({
  appName: "Settle",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "SET_WALLETCONNECT_PROJECT_ID",
  chains: [somniaShannon],
  ssr: true,
});
