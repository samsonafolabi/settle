import { useMemo } from "react";
import { useAccount, useReadContract } from "wagmi";
import { contracts } from "@/lib/contracts";
import { attestationStoreAbi } from "@/lib/abis/attestationStore";
import { formatUsdc, timeAgo } from "@/lib/format";
import type { ReceiptCardData } from "@/components/ReceiptCard";
import { useReceiptTxHashes } from "@/hooks/useReceiptTxHashes";
import { receiptTxKey } from "@/lib/receiptTxKey";
import {
  analyzeReceiptPolicy,
  poolApyLabel,
  poolById,
  poolByName,
  poolRiskLabel,
} from "@/lib/receiptIntentPolicy";

export type DepositReceipt = {
  wallet: `0x${string}`;
  amount: bigint;
  poolId: number;
  poolName: string;
  intentText: string;
  timestamp: bigint;
  loggedAt: bigint;
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

export function toReceiptCardData(
  receipt: DepositReceipt,
  index: number,
  txHash?: string,
): ReceiptCardData {
  const finalPool = poolById(receipt.poolId) ?? poolByName(receipt.poolName);
  const policy = analyzeReceiptPolicy(
    receipt.intentText,
    receipt.poolId,
    receipt.poolName,
  );

  const isMismatch = policy.mismatch;

  return {
    kind: "deposit",
    receiptId: `#${String(index + 1).padStart(4, "0")}`,
    amountLabel: `${formatUsdc(receipt.amount)} USDC`,
    status: isMismatch ? "warning" : "confirmed",
    intentText: receipt.intentText,
    finalPoolName: finalPool?.name ?? receipt.poolName,
    finalPoolId: finalPool?.id ?? receipt.poolId,
    apyLabel: poolApyLabel(receipt.poolId, receipt.poolName),
    riskLabel: poolRiskLabel(receipt.poolId, receipt.poolName),
    chainLabel: "Somnia Testnet",
    timestampLabel: timeAgo(receipt.timestamp),
    txHash,
    attestationStatus: "RECORDED",
    pipeline: {
      sage: {
        selectedPool: policy.expectedPool?.name,
        confidence: policy.expectedPool ? "HIGH" : undefined,
        reasoning:
          policy.expectedReason ??
          "Intent was recorded, but no explicit pool policy could be inferred from the receipt text.",
      },
      sentry: {
        verdict: isMismatch ? "WARNING" : "EXECUTE",
        riskLevel: isMismatch ? "HIGH" : "NONE",
        summary: isMismatch
          ? "Final vault result conflicts with the user's stated intent policy."
          : "Receipt result matches the inferred user intent policy.",
      },
      accord: {
        status: isMismatch ? "Override" : "Approved",
        result: isMismatch
          ? `Policy mismatch: expected ${policy.expectedPool?.name}, vault finalised ${finalPool?.name ?? receipt.poolName}.`
          : `Pool confirmed · final pool ${finalPool?.id ?? receipt.poolId}`,
      },
    },
  };
}

export function useReceiptHistory() {
  const { address } = useAccount();

  const deposits = useReadContract({
    address: contracts.attestationStore,
    abi: attestationStoreAbi,
    functionName: "getDeposits",
    args: address ? [address] : undefined,
    query: {
      enabled: Boolean(address),
      refetchInterval: 10_000,
    },
  });

  const depositReceipts = useMemo(() => {
    const data = deposits.data ?? [];

    return data
      .map(normalizeReceipt)
      .filter((r): r is DepositReceipt => r !== null);
  }, [deposits.data]);

  const txHashByReceiptKey = useReceiptTxHashes(address, depositReceipts);

  const receiptCards = useMemo(
    () =>
      depositReceipts
        .map((receipt, index) =>
          toReceiptCardData(
            receipt,
            index,
            txHashByReceiptKey.get(
              receiptTxKey({
                amount: receipt.amount,
                poolId: receipt.poolId,
                timestamp: receipt.timestamp,
              }),
            ),
          ),
        )
        .reverse(),
    [depositReceipts, txHashByReceiptKey],
  );

  return {
    deposits: depositReceipts,
    receiptCards,
    latestReceipt: receiptCards[0] ?? null,
    count: depositReceipts.length,
    isLoading: deposits.isLoading,
    error: deposits.error,
    refetch: deposits.refetch,
  };
}
