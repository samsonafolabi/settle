"use client";

import type { ReceiptCardData } from "@/components/ReceiptCard";
import {
  analyzeReceiptPolicy,
  poolApyLabel,
  poolById,
  poolByName,
  poolRiskLabel,
} from "@/lib/receiptIntentPolicy";

type DepositRunResult = {
  txHash?: `0x${string}`;
  depositId?: `0x${string}`;
  finalStatus?: "finalised" | "refunded" | "timeout" | "blocked" | "cancelled";
  finalPoolId?: number;
  finalApyBps?: bigint;
  sage?: {
    amountRaw: string;
    intentText: string;
    selectedPool: string;
    selectedPoolId: number;
    reasoning: string;
    confidence: "HIGH" | "MEDIUM" | "LOW";
  };
  verdict?: {
    verdict: "EXECUTE" | "WARNING" | "BLOCKED";
    riskLevel: "NONE" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    summary: string;
  };
};

function formatUsdc(raw?: string): string {
  if (!raw) return "0 USDC";

  const n = Number(BigInt(raw)) / 1_000_000;

  return `${n.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDC`;
}

export function buildDepositReceiptFromResult(
  result: DepositRunResult,
  fallbackIntent: string,
): ReceiptCardData {
  const intentText = result.sage?.intentText || fallbackIntent;
  const finalPool =
    poolById(result.finalPoolId) ??
    poolById(result.sage?.selectedPoolId) ??
    poolByName(result.sage?.selectedPool);

  const finalPoolId = finalPool?.id ?? result.finalPoolId ?? result.sage?.selectedPoolId;
  const finalPoolName = finalPool?.name ?? result.sage?.selectedPool ?? "Unknown pool";

  const policy = analyzeReceiptPolicy(intentText, finalPoolId, finalPoolName);
  const selectedVsFinalMismatch =
    Boolean(result.sage?.selectedPool && result.sage.selectedPool !== finalPoolName);
  const isMismatch = policy.mismatch || selectedVsFinalMismatch;

  return {
    kind: "deposit",
    receiptId: result.depositId ? `${result.depositId.slice(0, 10)}...` : "live",
    amountLabel: formatUsdc(result.sage?.amountRaw),
    status: result.finalStatus === "finalised" && !isMismatch ? "confirmed" : "warning",
    intentText,
    finalPoolName,
    finalPoolId,
    apyLabel:
      result.finalApyBps !== undefined
        ? `${(Number(result.finalApyBps) / 100).toFixed(2)}%`
        : poolApyLabel(finalPoolId, finalPoolName),
    riskLabel: poolRiskLabel(finalPoolId, finalPoolName),
    chainLabel: "Somnia Testnet",
    timestampLabel: "just now",
    txHash: result.txHash,
    attestationStatus: "RECORDED",
    pipeline: {
      sage: {
        selectedPool: policy.expectedPool?.name ?? result.sage?.selectedPool,
        confidence: result.sage?.confidence ?? (policy.expectedPool ? "HIGH" : undefined),
        reasoning:
          policy.expectedReason ??
          result.sage?.reasoning ??
          "Intent parsed into execution plan.",
      },
      sentry: {
        verdict: isMismatch ? "WARNING" : result.verdict?.verdict,
        riskLevel: isMismatch ? "HIGH" : result.verdict?.riskLevel,
        summary: isMismatch
          ? "Final result conflicts with the user's stated intent policy."
          : result.verdict?.summary,
      },
      accord: {
        status: isMismatch ? "Override" : "Approved",
        result: isMismatch
          ? `Policy mismatch: expected ${policy.expectedPool?.name ?? result.sage?.selectedPool}, vault finalised ${finalPoolName}.`
          : `Pool confirmed · final pool ${finalPoolId ?? "—"}`,
      },
    },
  };
}
