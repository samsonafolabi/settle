// src/core/confirm.ts
// Stage 3 — User Confirmation Gate
// Only reached when VerifAI returns WARNING
// BLOCKED never reaches here — it's already dead at Stage 2
// EXECUTE skips this entirely — goes straight to Stage 4
//
// This stage does two things:
// 1. Builds the confirmation payload the frontend renders
// 2. Processes the user's decision when it comes back

import { ethers } from "ethers";
import { IntentRecord } from "../types/IntentRecord";
import { getRecord, updateRecord } from "./store";

export type ConfirmationCard = {
  intentId: string;
  intent: string; // what the user originally asked for
  verdict: {
    riskLevel: string;
    summary: string;
    recommendation: string;
    findings: string[]; // human-readable risk findings
  };
  transaction: {
    chain: string;
    calldata: string;
    action: object; // structured — frontend renders this clearly
  };
  requestedAt: number;
};

export type ConfirmationDecision = {
  intentId: string;
  decision: "approved" | "rejected";
  approvalSig?: string; // required if approved — wallet signature
};

// ── Build the confirmation card ───────────────────────────
// Called immediately after verify() returns WARNING
// Frontend renders this — user sees it and decides

export function buildConfirmationCard(intentId: string): ConfirmationCard {
  const record = getRecord(intentId);

  if (record.status !== "PENDING_USER") {
    throw new Error(
      `Cannot build confirmation card for record in status: ${record.status}. Expected: PENDING_USER`,
    );
  }

  if (!record.verdict) {
    throw new Error(
      "Record has no verdict — verify() must run before confirm()",
    );
  }

  // Flatten findings into human-readable strings
  const findings = record.verdict.layers.securityLinter.findings.map(
    (f) => `[${f.severity}] ${f.check}: ${f.message}`,
  );

  return {
    intentId: record.intentId,
    intent: record.intent,
    verdict: {
      riskLevel: record.verdict.riskLevel,
      summary: record.verdict.summary,
      recommendation: record.verdict.recommendation,
      findings,
    },
    transaction: {
      chain: "somnia",
      calldata: record.calldata!,
      action: record.action!,
    },
    requestedAt: Date.now(),
  };
}

// ── Process the user's decision ───────────────────────────
// Called when frontend sends back approved or rejected
// If approved — validates the wallet signature before accepting
// If rejected — locks the record immediately, no further processing

export async function processDecision(
  decision: ConfirmationDecision,
): Promise<IntentRecord> {
  const { intentId, approvalSig } = decision;
  const record = getRecord(intentId);

  if (record.status !== "PENDING_USER") {
    throw new Error(
      `Cannot process decision for record in status: ${record.status}`,
    );
  }

  // ── Rejection path — fast, no signature needed ────────
  if (decision.decision === "rejected") {
    return updateRecord(intentId, {
      decision: "rejected",
      decisionTime: Date.now(),
      status: "REJECTED",
    });
  }

  // ── Approval path — signature required and verified ───
  if (!approvalSig) {
    throw new Error("Approval signature required when decision is approved");
  }

  // Verify the signature proves the wallet owner approved this specific intent
  // They sign the intentHash — proving they saw and authorized this exact record
  const recoveredAddress = ethers.verifyMessage(record.intentHash, approvalSig);

  if (recoveredAddress.toLowerCase() !== record.wallet.toLowerCase()) {
    throw new Error(
      `Signature mismatch. Expected: ${record.wallet}, got: ${recoveredAddress}`,
    );
  }

  return updateRecord(intentId, {
    approvalSig,
    decision: "approved",
    decisionTime: Date.now(),
    status: "VERIFIED",
  });
}
