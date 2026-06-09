// settle-sentry/src/app/api/v1/verify/route.ts
import { NextResponse } from "next/server";
import { SentryRequest, Verdict } from "@/types";
import { decodeCalldata } from "@/lib/decoder/calldataDecoder";
import { compareIntent } from "@/lib/comparator/intentComparator";
import { lintCalldata } from "@/lib/linter/safetyLinter";

export async function POST(request: Request) {
  try {
    const body: SentryRequest = await request.json();

    if (!body.intent || !body.calldata || !body.action) {
      return NextResponse.json(
        { error: "Missing required fields: intent, calldata, action" },
        { status: 400 },
      );
    }

    const decoded = decodeCalldata(body.calldata, body.action.type);

    const [comparison, lintResult] = await Promise.all([
      compareIntent(body, decoded),
      Promise.resolve(
        lintCalldata(decoded, body.slippageBps, body.selectedPoolId),
      ),
    ]);

    const verdict = buildVerdict(comparison, lintResult);

    console.log(
      `[SENTRY] "${body.intent}" | ${verdict.verdict} | ${verdict.riskLevel}`,
    );

    return NextResponse.json(verdict);
  } catch (error) {
    console.error("[SENTRY] Error:", error);

    const blockedVerdict: Verdict = {
      verdict: "BLOCKED",
      riskLevel: "CRITICAL",
      summary: "Verification service error",
      recommendation: "DO NOT EXECUTE. Could not verify transaction safety.",
      details: [error instanceof Error ? error.message : "Unknown error"],
      layers: {
        intentComparison: { passed: false, issues: ["Verification failed"] },
        securityLinter: { riskLevel: "CRITICAL", findings: [] },
      },
    };

    return NextResponse.json(blockedVerdict, { status: 200 });
  }
}

function buildVerdict(
  comparison: { passed: boolean; issues: string[] },
  lintResult: { riskLevel: string; findings: any[] },
): Verdict {
  if (!comparison.passed) {
    return {
      verdict: "BLOCKED",
      riskLevel: "CRITICAL",
      summary: "Transaction does not match your intent",
      recommendation:
        "DO NOT EXECUTE. Action does not match what you asked for.",
      details: comparison.issues,
      layers: {
        intentComparison: { passed: false, issues: comparison.issues },
        securityLinter: {
          riskLevel: lintResult.riskLevel as any,
          findings: lintResult.findings,
        },
      },
    };
  }

  if (lintResult.riskLevel === "CRITICAL") {
    return {
      verdict: "BLOCKED",
      riskLevel: "CRITICAL",
      summary: "Transaction has critical safety issues",
      recommendation: "DO NOT EXECUTE. Fix safety issues first.",
      details: lintResult.findings.map((f: any) => f.message),
      layers: {
        intentComparison: { passed: true, issues: [] },
        securityLinter: {
          riskLevel: "CRITICAL",
          findings: lintResult.findings,
        },
      },
    };
  }

  if (["HIGH", "MEDIUM"].includes(lintResult.riskLevel)) {
    return {
      verdict: "WARNING",
      riskLevel: lintResult.riskLevel as any,
      summary: "Transaction matches intent with risk detected",
      recommendation: "Review findings before approving.",
      details: lintResult.findings.map((f: any) => f.message),
      layers: {
        intentComparison: { passed: true, issues: [] },
        securityLinter: {
          riskLevel: lintResult.riskLevel as any,
          findings: lintResult.findings,
        },
      },
    };
  }

  return {
    verdict: "EXECUTE",
    riskLevel: "NONE",
    summary: "Transaction verified — safe to execute",
    recommendation: "All checks passed.",
    details: ["✓ Action matches your intent", "✓ All safety checks passed"],
    layers: {
      intentComparison: { passed: true, issues: [] },
      securityLinter: { riskLevel: "NONE", findings: [] },
    },
  };
}
