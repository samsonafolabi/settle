// settle-sentry/src/lib/linter/safetyLinter.ts
import {
  DecodedCalldata,
  Finding,
  RiskLevel,
  isKnownPool,
  isValidPoolId,
} from "@/types";

export type LinterResult = {
  riskLevel: RiskLevel;
  findings: Finding[];
};

const SLIPPAGE_WARNING_THRESHOLD = 100; // 1%
const SLIPPAGE_BLOCK_THRESHOLD = 200; // 2%
const MAX_DEPOSIT_USDC = 1_000_000;
const MIN_DEPOSIT_USDC = 1;

export function lintCalldata(
  decoded: DecodedCalldata,
  slippageBps: number,
  selectedPoolId?: number,
): LinterResult {
  const findings: Finding[] = [];

  // ── Unknown action ──────────────────────────────────────
  if (decoded.type === "unknown") {
    findings.push({
      check: "unknown_action",
      severity: "CRITICAL",
      message: "Could not decode calldata — action type unknown",
    });
    return { riskLevel: "CRITICAL", findings };
  }

  // ── Slippage checks ─────────────────────────────────────
  if (slippageBps === 0) {
    findings.push({
      check: "zero_slippage",
      severity: "CRITICAL",
      message: "Slippage is 0 — transaction will likely fail",
    });
  } else if (slippageBps > SLIPPAGE_BLOCK_THRESHOLD) {
    findings.push({
      check: "critical_slippage",
      severity: "CRITICAL",
      message: `Slippage of ${slippageBps / 100}% is dangerously high`,
    });
  } else if (slippageBps > SLIPPAGE_WARNING_THRESHOLD) {
    findings.push({
      check: "high_slippage",
      severity: "HIGH",
      message: `Slippage of ${slippageBps / 100}% exceeds safe threshold of 1%`,
    });
  }

  // ── Amount checks ───────────────────────────────────────
  if (decoded.type === "deposit" || decoded.type === "withdraw") {
    const amountUsdc = Number(decoded.amountRaw) / 1_000_000;

    if (amountUsdc <= 0) {
      findings.push({
        check: "zero_amount",
        severity: "CRITICAL",
        message: "Amount is zero — transaction would do nothing",
      });
    } else if (amountUsdc < MIN_DEPOSIT_USDC) {
      findings.push({
        check: "dust_amount",
        severity: "LOW",
        message: `Amount of ${amountUsdc} USDC is very small`,
      });
    } else if (amountUsdc > MAX_DEPOSIT_USDC) {
      findings.push({
        check: "exceeds_max",
        severity: "HIGH",
        message: `Amount of ${amountUsdc} USDC exceeds vault maximum`,
      });
    }
  }

  // ── Pool checks (deposit only) ───────────────────────────
  if (decoded.type === "deposit") {
    if (!isKnownPool(decoded.pool)) {
      findings.push({
        check: "unknown_pool",
        severity: "CRITICAL",
        message: `Target pool "${decoded.pool}" is not a known pool`,
      });
    }

    // Validate poolId matches pool name
    if (selectedPoolId !== undefined && !isValidPoolId(selectedPoolId)) {
      findings.push({
        check: "invalid_pool_id",
        severity: "CRITICAL",
        message: `Pool ID ${selectedPoolId} is not valid (expected 0-2)`,
      });
    }
  }

  return { riskLevel: determineRiskLevel(findings), findings };
}

function determineRiskLevel(findings: Finding[]): RiskLevel {
  if (findings.some((f) => f.severity === "CRITICAL")) return "CRITICAL";
  if (findings.some((f) => f.severity === "HIGH")) return "HIGH";
  if (findings.some((f) => f.severity === "MEDIUM")) return "MEDIUM";
  if (findings.some((f) => f.severity === "LOW")) return "LOW";
  return "NONE";
}
