import { useAccount, useReadContract } from "wagmi";
import { contracts } from "@/lib/contracts";
import { vaultAbi } from "@/lib/abis/vault";
import { formatApy, formatUsdc } from "@/lib/format";

export type VaultPosition = {
  balance: bigint;
  depositTime: bigint;
  accruedInterest: bigint;
  lastClaimTime: bigint;
  poolId: number;
  poolAPY: bigint;
  active: boolean;
};

const EMPTY_POSITION: VaultPosition = {
  balance: BigInt(0),
  depositTime: BigInt(0),
  accruedInterest: BigInt(0),
  lastClaimTime: BigInt(0),
  poolId: 0,
  poolAPY: BigInt(0),
  active: false,
};

export function normalizeVaultPosition(raw: unknown): VaultPosition {
  if (!raw) return EMPTY_POSITION;

  // viem may return public-struct getters as an array-like tuple.
  if (Array.isArray(raw)) {
    return {
      balance: BigInt(raw[0] ?? 0),
      depositTime: BigInt(raw[1] ?? 0),
      accruedInterest: BigInt(raw[2] ?? 0),
      lastClaimTime: BigInt(raw[3] ?? 0),
      poolId: Number(raw[4] ?? 0),
      poolAPY: BigInt(raw[5] ?? 0),
      active: Boolean(raw[6]),
    };
  }

  // Or as named fields if ABI/client supports it.
  const p = raw as Partial<Record<keyof VaultPosition, unknown>>;

  return {
    balance: BigInt(p.balance ?? 0),
    depositTime: BigInt(p.depositTime ?? 0),
    accruedInterest: BigInt(p.accruedInterest ?? 0),
    lastClaimTime: BigInt(p.lastClaimTime ?? 0),
    poolId: Number(p.poolId ?? 0),
    poolAPY: BigInt(p.poolAPY ?? 0),
    active: Boolean(p.active),
  };
}

export function usePosition() {
  const { address } = useAccount();

  const query = useReadContract({
    address: contracts.vault,
    abi: vaultAbi,
    functionName: "positions",
    args: address ? [address] : undefined,
    query: {
      enabled: Boolean(address),
      refetchInterval: 5_000,
    },
  });

  const position = normalizeVaultPosition(query.data);

  return {
    ...query,
    position,
    active: position.active,
    balanceRaw: position.balance,
    balance: formatUsdc(position.balance),
    poolId: position.poolId,
    apyBps: position.poolAPY,
    apy: formatApy(position.poolAPY),
  };
}
