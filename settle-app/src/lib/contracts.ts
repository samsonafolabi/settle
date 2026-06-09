import type { Address } from "viem";

function mustAddress(value: string | undefined, name: string): Address {
  if (!value) throw new Error(`${name} is not set`);
  return value as Address;
}

export const contracts = {
  usdc: mustAddress(process.env.NEXT_PUBLIC_USDC_ADDRESS, "NEXT_PUBLIC_USDC_ADDRESS"),
  apyFeed: mustAddress(process.env.NEXT_PUBLIC_APY_FEED_ADDRESS, "NEXT_PUBLIC_APY_FEED_ADDRESS"),
  attestationStore: mustAddress(
    process.env.NEXT_PUBLIC_ATTESTATION_STORE_ADDRESS,
    "NEXT_PUBLIC_ATTESTATION_STORE_ADDRESS",
  ),
  vault: mustAddress(process.env.NEXT_PUBLIC_VAULT_CONTRACT_ADDRESS, "NEXT_PUBLIC_VAULT_CONTRACT_ADDRESS"),
  reactiveTrigger: mustAddress(
    process.env.NEXT_PUBLIC_REACTIVE_TRIGGER_ADDRESS,
    "NEXT_PUBLIC_REACTIVE_TRIGGER_ADDRESS",
  ),
} as const;

export const explorer = {
  tx: (hash: string) => `${process.env.NEXT_PUBLIC_EXPLORER_URL || "https://shannon-explorer.somnia.network"}/tx/${hash}`,
  address: (address: string) =>
    `${process.env.NEXT_PUBLIC_EXPLORER_URL || "https://shannon-explorer.somnia.network"}/address/${address}`,
};
