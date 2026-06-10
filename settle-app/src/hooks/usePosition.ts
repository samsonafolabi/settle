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

// Helper: safely coerce unknown → BigInt-acceptable type
function safeBigInt(value: unknown): bigint {
  if (value === null || value === undefined) return BigInt(0);
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "bigint" ||
    typeof value === "boolean"
  ) {
    return BigInt(value);
  }
  return BigInt(0);
}

function safeNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string" || typeof value === "bigint")
    return Number(value);
  return 0;
}

function safeBoolean(value: unknown): boolean {
  return Boolean(value);
}

export function normalizeVaultPosition(raw: unknown): VaultPosition {
  if (!raw) return EMPTY_POSITION;

  // viem may return public-struct getters as an array-like tuple.
  if (Array.isArray(raw)) {
    return {
      balance: safeBigInt(raw[0]),
      depositTime: safeBigInt(raw[1]),
      accruedInterest: safeBigInt(raw[2]),
      lastClaimTime: safeBigInt(raw[3]),
      poolId: safeNumber(raw[4]),
      poolAPY: safeBigInt(raw[5]),
      active: safeBoolean(raw[6]),
    };
  }

  // Or as named fields if ABI/client supports it.
  const p = raw as Partial<Record<keyof VaultPosition, unknown>>;

  return {
    balance: safeBigInt(p.balance),
    depositTime: safeBigInt(p.depositTime),
    accruedInterest: safeBigInt(p.accruedInterest),
    lastClaimTime: safeBigInt(p.lastClaimTime),
    poolId: safeNumber(p.poolId),
    poolAPY: safeBigInt(p.poolAPY),
    active: safeBoolean(p.active),
  };
}

export function usePosition(overrideAddress?: `0x${string}`) {
  const { address: _walletAddress } = useAccount();
  const address = overrideAddress ?? _walletAddress;

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
