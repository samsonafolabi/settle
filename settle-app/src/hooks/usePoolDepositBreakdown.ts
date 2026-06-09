import { useMemo } from "react";
import { useAccount, useReadContract } from "wagmi";
import { contracts } from "@/lib/contracts";
import { attestationStoreAbi } from "@/lib/abis/attestationStore";
import { formatUsdc } from "@/lib/format";

export type DepositReceipt = {
  wallet: `0x${string}`;
  amount: bigint;
  poolId: number;
  poolName: string;
  intentText: string;
  timestamp: bigint;
  loggedAt: bigint;
};

export type PoolDepositSummary = {
  amountRaw: bigint;
  amount: string;
  count: number;
  poolName: string;
  latestTimestamp: bigint;
};

function toBigIntSafe(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isFinite(value)) {
    return BigInt(Math.trunc(value));
  }
  if (typeof value === "string" && value.trim() !== "") {
    return BigInt(value);
  }
  return BigInt(0);
}

function normalizeReceipt(raw: unknown): DepositReceipt | null {
  if (!raw) return null;

  if (Array.isArray(raw)) {
    return {
      wallet: String(raw[0] ?? "0x0000000000000000000000000000000000000000") as `0x${string}`,
      amount: toBigIntSafe(raw[1]),
      poolId: Number(raw[2] ?? 0),
      poolName: String(raw[3] ?? `Pool ${raw[2] ?? 0}`),
      intentText: String(raw[4] ?? ""),
      timestamp: toBigIntSafe(raw[5]),
      loggedAt: toBigIntSafe(raw[6]),
    };
  }

  const r = raw as {
    wallet?: unknown;
    amount?: unknown;
    poolId?: unknown;
    poolName?: unknown;
    intentText?: unknown;
    timestamp?: unknown;
    loggedAt?: unknown;
  };

  return {
    wallet: String(r.wallet ?? "0x0000000000000000000000000000000000000000") as `0x${string}`,
    amount: toBigIntSafe(r.amount),
    poolId: Number(r.poolId ?? 0),
    poolName: String(r.poolName ?? `Pool ${r.poolId ?? 0}`),
    intentText: String(r.intentText ?? ""),
    timestamp: toBigIntSafe(r.timestamp),
    loggedAt: toBigIntSafe(r.loggedAt),
  };
}

export function usePoolDepositBreakdown() {
  const { address } = useAccount();

  const query = useReadContract({
    address: contracts.attestationStore,
    abi: attestationStoreAbi,
    functionName: "getDeposits",
    args: address ? [address] : undefined,
    query: {
      enabled: Boolean(address),
      refetchInterval: 10_000,
    },
  });

  const receipts = useMemo(() => {
    const data = query.data ?? [];
    return data.map(normalizeReceipt).filter((r): r is DepositReceipt => r !== null);
  }, [query.data]);

  const byPool = useMemo(() => {
    const grouped: Record<number, PoolDepositSummary> = {};

    for (const receipt of receipts) {
      const existing = grouped[receipt.poolId];

      if (!existing) {
        grouped[receipt.poolId] = {
          amountRaw: receipt.amount,
          amount: formatUsdc(receipt.amount),
          count: 1,
          poolName: receipt.poolName,
          latestTimestamp: receipt.timestamp,
        };
        continue;
      }

      const amountRaw = existing.amountRaw + receipt.amount;

      grouped[receipt.poolId] = {
        amountRaw,
        amount: formatUsdc(amountRaw),
        count: existing.count + 1,
        poolName: receipt.poolName || existing.poolName,
        latestTimestamp:
          receipt.timestamp > existing.latestTimestamp
            ? receipt.timestamp
            : existing.latestTimestamp,
      };
    }

    return grouped;
  }, [receipts]);

  const totalRaw = useMemo(
    () => receipts.reduce((sum, r) => sum + r.amount, BigInt(0)),
    [receipts],
  );

  return {
    ...query,
    receipts,
    byPool,
    totalRaw,
    totalDeposited: formatUsdc(totalRaw),
  };
}
