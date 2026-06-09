// src/core/verify.ts
// Stage 2 — Verification Gate
import { Verdict } from "../types/Verdict";
import { IntentRecord } from "../types/IntentRecord";
import { getRecord, updateRecord } from "./store";
import { SageOutput } from "../types/SageOutput";

type VerifyInput = {
  intentId: string;
  sageOutput: SageOutput;
  chain?: string;
};

type VerifyResult = {
  record: IntentRecord;
  verdict: Verdict;
};

export async function verify(input: VerifyInput): Promise<VerifyResult> {
  const { intentId, sageOutput, chain = "somnia" } = input;
  const record = getRecord(intentId);

  if (record.status !== "CAPTURED") {
    throw new Error(
      `Cannot verify record in status: ${record.status}. Expected: CAPTURED`,
    );
  }

  const sentryPayload = {
    intent: record.intent,
    intentText: sageOutput.intentText,
    action: {
      ...sageOutput.action,
      amountRaw: sageOutput.amountRaw.toString(),
    },
    calldata: sageOutput.calldata,
    wallet: record.wallet,
    slippageBps: sageOutput.slippageBps,
    amountRaw: sageOutput.amountRaw.toString(),
    chain,
    selectedPool: sageOutput.selectedPool,
    selectedPoolId: sageOutput.selectedPoolId, // ← new
  };

  const sentryUrl = process.env.SENTRY_URL;
  if (!sentryUrl) throw new Error("SENTRY_URL environment variable not set");

  let verdict: Verdict;

  try {
    const response = await fetch(`${sentryUrl}/api/v1/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sentryPayload),
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      throw new Error(
        `Sentry returned ${response.status}: ${response.statusText}`,
      );
    }

    verdict = (await response.json()) as Verdict;
  } catch (error) {
    verdict = {
      verdict: "BLOCKED",
      riskLevel: "CRITICAL",
      summary: "Verification service unreachable",
      recommendation: "DO NOT EXECUTE. Could not verify transaction safety.",
      details: [error instanceof Error ? error.message : "Unknown error"],
      layers: {
        intentComparison: { passed: false, issues: ["Sentry unreachable"] },
        securityLinter: { riskLevel: "CRITICAL", findings: [] },
      },
    };
  }

  const nextStatus =
    verdict.verdict === "EXECUTE"
      ? "VERIFIED"
      : verdict.verdict === "WARNING"
        ? "PENDING_USER"
        : "BLOCKED";

  const updatedRecord = updateRecord(intentId, {
    calldata: sageOutput.calldata,
    action: sageOutput.action,
    amountRaw: sageOutput.amountRaw,
    intentText: sageOutput.intentText,
    selectedPool: sageOutput.selectedPool,
    selectedPoolId: sageOutput.selectedPoolId, // ← new
    safetyPrompt: sageOutput.safetyPrompt, // ← new
    poolPrompt: sageOutput.poolPrompt, // ← new
    slippageBps: sageOutput.slippageBps,
    verdict,
    status: nextStatus,
  });

  return { record: updatedRecord, verdict };
}
