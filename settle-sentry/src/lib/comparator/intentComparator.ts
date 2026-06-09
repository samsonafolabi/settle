// settle-sentry/src/lib/comparator/intentComparator.ts
import {
  SentryRequest,
  DecodedCalldata,
  isKnownPool,
  POOL_RISK,
} from "@/types";
import { parseIntent, ParsedKeywords } from "@/lib/parser/intentParser";

export type ComparisonResult = {
  passed: boolean;
  issues: string[];
};

export async function compareIntent(
  request: SentryRequest,
  decoded: DecodedCalldata,
): Promise<ComparisonResult> {
  const issues: string[] = [];
  const keywords: ParsedKeywords = await parseIntent(request.intent);

  // ── Action type check ───────────────────────────────────
  if (
    keywords.actionType !== "unknown" &&
    keywords.actionType !== decoded.type
  ) {
    issues.push(
      `Intent says "${keywords.actionType}" but action is "${decoded.type}"`,
    );
  }

  // ── Amount check ────────────────────────────────────────
  if (
    keywords.mentionedAmount !== null &&
    (decoded.type === "deposit" || decoded.type === "withdraw")
  ) {
    const decodedAmount = Number(decoded.amountRaw) / 1_000_000;
    const variance =
      Math.abs(decodedAmount - keywords.mentionedAmount) /
      keywords.mentionedAmount;

    if (variance > 0.01) {
      issues.push(
        `Intent mentions ${keywords.mentionedAmount} USDC but action encodes ${decodedAmount.toFixed(2)} USDC`,
      );
    }
  }

  // ── Pool checks (deposit only) ──────────────────────────
  if (decoded.type === "deposit") {
    // Unknown pool
    if (!isKnownPool(decoded.pool)) {
      issues.push(`Action references unknown pool: ${decoded.pool}`);
    }

    // Specific pool named in intent doesn't match
    if (
      keywords.mentionedPool &&
      decoded.pool.toUpperCase() !== keywords.mentionedPool.toUpperCase()
    ) {
      issues.push(
        `Intent specifies ${keywords.mentionedPool} but action uses ${decoded.pool}`,
      );
    }

    // Risk preference mismatch
    const poolRisk = POOL_RISK[decoded.pool];
    if (keywords.riskPreference === "LOW" && poolRisk === "HIGH") {
      issues.push(
        `Intent requests low risk but action uses ${decoded.pool} (HIGH risk)`,
      );
    }
    if (keywords.riskPreference === "HIGH" && poolRisk === "LOW") {
      issues.push(
        `Intent requests high yield but action uses ${decoded.pool} (LOW risk)`,
      );
    }

    // Sage selectedPool consistency check
    if (request.selectedPool && decoded.pool !== request.selectedPool) {
      issues.push(
        `Sage selected ${request.selectedPool} but calldata uses ${decoded.pool}`,
      );
    }

    // PoolId consistency — name must match id
    if (request.selectedPoolId !== undefined) {
      const expectedNames: Record<number, string> = {
        0: "SETTLE_POOL_A",
        1: "SETTLE_POOL_B",
        2: "SETTLE_POOL_C",
      };
      const expectedName = expectedNames[request.selectedPoolId];
      if (expectedName && decoded.pool !== expectedName) {
        issues.push(
          `Pool ID ${request.selectedPoolId} should be ${expectedName} but calldata uses ${decoded.pool}`,
        );
      }
    }
  }

  return { passed: issues.length === 0, issues };
}
