// src/types/QuillProof.ts
// The final signed output of the Quill attestation pipeline

import { Verdict } from "./Verdict";

export type QuillProof = {
  // Identity
  proofId: string;
  intentId: string;

  // Story
  intentHash: string;
  wallet: string;
  verdict: Verdict;

  // Transaction
  calldata: string;
  chain: string;

  // Vault call params
  selectedPool: string; // pool name — for display
  selectedPoolId: number; // uint8 poolId — for vault.deposit()
  safetyPrompt: string; // Accord call 1
  poolPrompt: string; // Accord call 2
  amountRaw: bigint;
  intentText: string;
  slippageBps: number;

  // WARNING path
  approvalSig?: string;

  // Quill signature
  quillSig: string;

  // Timestamps
  issuedAt: number;

  // Onchain reference
  txHash?: string;
};
