// src/types/IntentRecord.ts
import { Verdict } from "./Verdict";

export type IntentRecordStatus =
  | "CAPTURED"
  | "VERIFIED"
  | "PENDING_USER"
  | "ATTESTED"
  | "SUBMITTED"
  | "REJECTED"
  | "BLOCKED";

export type IntentRecord = {
  // Stage 1
  intentId: string;
  intentHash: string;
  intent: string;
  wallet: string;
  captureTime: number;
  status: IntentRecordStatus;

  // Sage output
  amountRaw?: bigint;
  intentText?: string;
  slippageBps?: number;
  selectedPool?: string;
  selectedPoolId?: number; // uint8 poolId for vault
  safetyPrompt?: string; // Accord call 1
  poolPrompt?: string; // Accord call 2

  // Stage 2
  calldata?: string;
  action?: object;
  verdict?: Verdict;

  // Stage 3
  approvalSig?: string;
  decision?: "approved" | "rejected";
  decisionTime?: number;

  // Stage 4
  attestedAt?: number;
  quillProofId?: string;

  // Stage 5
  txHash?: string;
  submittedAt?: number;
};
