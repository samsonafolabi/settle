// src/core/store.ts
// In-memory store for IntentRecords during their lifecycle
// Records live here from Stage 1 (capture) through Stage 5 (submitted)
//
// Hackathon: in-memory is fine — records only need to survive
// a single user session. The permanent record is the QuillProof onchain.
//
// Post-hackathon: swap backing store to Redis or Postgres
// by changing only this file — nothing else touches storage directly

import { IntentRecord, IntentRecordStatus } from "../types/IntentRecord";
import { QuillProof } from "../types/QuillProof";

// Separate maps for records and proofs
// Proofs are immutable once issued — never updated, only added
const records = new Map<string, IntentRecord>();
const proofs = new Map<string, QuillProof>();

// ── Records ───────────────────────────────────────────────

export function saveRecord(record: IntentRecord): void {
  records.set(record.intentId, record);
}

export function getRecord(intentId: string): IntentRecord {
  const record = records.get(intentId);
  if (!record) {
    throw new Error(`IntentRecord not found: ${intentId}`);
  }
  return record;
}

export function updateRecord(
  intentId: string,
  updates: Partial<IntentRecord>,
): IntentRecord {
  const existing = getRecord(intentId);

  // Never allow intentHash, wallet, intent, or captureTime to be updated
  // These are locked at Stage 1 — immutable by design
  const { intentHash, wallet, intent, captureTime, ...safeUpdates } = updates;

  const updated: IntentRecord = { ...existing, ...safeUpdates };
  records.set(intentId, updated);
  return updated;
}

export function updateStatus(
  intentId: string,
  status: IntentRecordStatus,
): IntentRecord {
  return updateRecord(intentId, { status });
}

// ── Proofs ────────────────────────────────────────────────

export function saveProof(proof: QuillProof): void {
  proofs.set(proof.proofId, proof);
  // Also index by intentId for quick lookup
  proofs.set(`intent:${proof.intentId}`, proof);
}

export function getProof(proofId: string): QuillProof {
  const proof = proofs.get(proofId);
  if (!proof) {
    throw new Error(`QuillProof not found: ${proofId}`);
  }
  return proof;
}

export function getProofByIntentId(intentId: string): QuillProof {
  const proof = proofs.get(`intent:${intentId}`);
  if (!proof) {
    throw new Error(`QuillProof not found for intentId: ${intentId}`);
  }
  return proof;
}

// ── Utilities ─────────────────────────────────────────────

export function getAllRecords(): IntentRecord[] {
  // Return only primary records, not intent: indexed proofs
  return Array.from(records.values());
}

export function clearStore(): void {
  // Test utility only — never call in production
  records.clear();
  proofs.clear();
}
