// src/client/QuillClient.ts
// The single public interface for the entire Quill pipeline
// Everything outside Quill touches only this class
// Internals stay hidden — this is what makes Quill publishable as an SDK
//
// LATENCY STRATEGY across the full pipeline:
// Stage 1 — sync, <1ms, pure computation
// Stage 2 — async, ~500ms, one VerifAI HTTP call (parallel internally)
// Stage 3 — async, human-gated (WARNING path only)
// Stage 4 — async, <50ms, pure computation + signing
// Stage 5 — async, ~2-5s, two parallel onchain submissions
//
// Total happy path (EXECUTE): ~3-6 seconds end to end
// WARNING path adds human confirmation time on top

import { captureIntent } from "../core/capture";
import { verify } from "../core/verify";
import {
  buildConfirmationCard,
  processDecision,
  ConfirmationCard,
  ConfirmationDecision,
} from "../core/confirm";
import { issueAttestation, verifyProofSignature } from "../core/attest";
import { submitProof, SubmissionResult } from "../onchain/submit";
import {
  getRecord,
  getProof,
  getProofByIntentId,
  getAllRecords,
} from "../core/store";
import { IntentRecord } from "../types/IntentRecord";
import { QuillProof } from "../types/QuillProof";
import { Verdict } from "../types/Verdict";
import { SageOutput } from "../types/SageOutput";

export type QuillConfig = {
  verifaiUrl?: string; // overrides VERIFAI_URL env var
  signingKey?: string; // overrides QUILL_SIGNING_KEY env var
  submissionKey?: string; // overrides QUILL_SUBMISSION_KEY env var
  somniaRpcUrl?: string; // overrides SOMNIA_RPC_URL env var
  vaultAddress?: string; // overrides VAULT_CONTRACT_ADDRESS env var
  attestationStoreAddress?: string; // overrides ATTESTATION_STORE_ADDRESS env var
  chain?: string; // defaults to 'somnia'
};

export type RunResult = {
  record: IntentRecord;
  proof?: QuillProof;
  submission?: SubmissionResult;
  confirmationCard?: ConfirmationCard; // present if WARNING
  blocked?: boolean; // true if BLOCKED
  blockReason?: string;
};

export class QuillClient {
  private chain: string;

  constructor(config: QuillConfig = {}) {
    // Config values override environment variables
    // Allows programmatic configuration without env files
    if (config.verifaiUrl) process.env.VERIFAI_URL = config.verifaiUrl;
    if (config.signingKey) process.env.QUILL_SIGNING_KEY = config.signingKey;
    if (config.submissionKey)
      process.env.QUILL_SUBMISSION_KEY = config.submissionKey;
    if (config.somniaRpcUrl) process.env.SOMNIA_RPC_URL = config.somniaRpcUrl;
    if (config.vaultAddress)
      process.env.VAULT_CONTRACT_ADDRESS = config.vaultAddress;
    if (config.attestationStoreAddress) {
      process.env.ATTESTATION_STORE_ADDRESS = config.attestationStoreAddress;
    }

    this.chain = config.chain ?? "somnia";
  }

  // ── Stage 1 ───────────────────────────────────────────
  // Call this the moment the user submits their intent
  // Synchronous — returns instantly, no await needed

  captureIntent(intent: string, wallet: string): IntentRecord {
    const record = captureIntent(intent, wallet);
    // Import store directly to save — captureIntent is pure
    const { saveRecord } = require("../core/store");
    saveRecord(record);
    return record;
  }

  // ── Stage 2 ───────────────────────────────────────────
  // Call this after the AI layer builds the transaction
  // Returns verdict — caller decides what to do next based on verdict.verdict

  // Replace the verify method in QuillClient.ts
  async verify(
    intentId: string,
    sageOutput: SageOutput,
  ): Promise<{ record: IntentRecord; verdict: Verdict }> {
    return verify({ intentId, sageOutput, chain: this.chain });
  }

  // ── Stage 3 ───────────────────────────────────────────
  // Only call these on WARNING verdict
  // buildConfirmationCard — send result to frontend to render
  // processDecision — call when user responds

  buildConfirmationCard(intentId: string): ConfirmationCard {
    return buildConfirmationCard(intentId);
  }

  async processDecision(decision: ConfirmationDecision): Promise<IntentRecord> {
    return processDecision(decision);
  }

  // ── Stage 4 ───────────────────────────────────────────
  // Call after EXECUTE verdict or after user approval
  // Produces the signed QuillProof

  async issueAttestation(intentId: string): Promise<QuillProof> {
    return issueAttestation(intentId, this.chain);
  }

  // ── Stage 5 ───────────────────────────────────────────
  // Call after issueAttestation
  // Submits to Somnia vault + attestation store in parallel

  async submitProof(proof: QuillProof): Promise<SubmissionResult> {
    return submitProof(proof);
  }

  // ── Full pipeline — happy path ─────────────────────────
  // Runs Stages 1-5 automatically for EXECUTE verdicts
  // Returns early with confirmationCard if WARNING
  // Returns early with blocked=true if BLOCKED
  // Use this for simple integrations — use individual methods
  // for fine-grained control

  async run(
    intent: string,
    wallet: string,
    sageOutput: SageOutput,
  ): Promise<RunResult> {
    // Stage 1
    const record = this.captureIntent(intent, wallet);

    // Stage 2
    const { verdict } = await this.verify(record.intentId, sageOutput);

    // BLOCKED
    if (verdict.verdict === "BLOCKED") {
      return {
        record: getRecord(record.intentId),
        blocked: true,
        blockReason: verdict.summary,
      };
    }

    // WARNING
    if (verdict.verdict === "WARNING") {
      const confirmationCard = this.buildConfirmationCard(record.intentId);
      return {
        record: getRecord(record.intentId),
        confirmationCard,
      };
    }

    // EXECUTE
    const proof = await this.issueAttestation(record.intentId);
    const submission = await this.submitProof(proof);

    return {
      record: getRecord(record.intentId),
      proof,
      submission,
    };
  }
  // ── Utilities ──────────────────────────────────────────

  getRecord(intentId: string): IntentRecord {
    return getRecord(intentId);
  }

  getProof(proofId: string): QuillProof {
    return getProof(proofId);
  }

  getProofByIntentId(intentId: string): QuillProof {
    return getProofByIntentId(intentId);
  }

  getAllRecords(): IntentRecord[] {
    return getAllRecords();
  }

  async verifyProofSignature(proof: QuillProof): Promise<boolean> {
    return verifyProofSignature(proof);
  }
}
