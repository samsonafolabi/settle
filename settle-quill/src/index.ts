// src/index.ts
// Public API — export only what external consumers need
// Everything else stays internal

export { QuillClient } from "./client/QuillClient";
export type { QuillConfig, RunResult } from "./client/QuillClient";
export type { IntentRecord, IntentRecordStatus } from "./types/IntentRecord";
export type { QuillProof } from "./types/QuillProof";
export type {
  Verdict,
  VerdictResult,
  RiskLevel,
  Finding,
} from "./types/Verdict";
export type { ConfirmationCard, ConfirmationDecision } from "./core/confirm";
