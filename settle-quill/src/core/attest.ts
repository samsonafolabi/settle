// src/core/attest.ts
// Stage 4 — Attestation Issuance
// Quill is now a receipt system — not a vault gatekeeper
// The signature here is for audit purposes, not onchain verification
// Vault only needs: amount, poolId, intentText, safetyPrompt, poolPrompt

import { ethers } from "ethers";
import { v4 as uuidv4 } from "uuid";
import { QuillProof } from "../types/QuillProof";
import { getRecord, updateRecord, saveProof } from "./store";

function getSigningWallet(): ethers.Wallet {
  const privateKey = process.env.QUILL_SIGNING_KEY;
  if (!privateKey) throw new Error("QUILL_SIGNING_KEY not set");
  return new ethers.Wallet(privateKey);
}

// Signing message for audit trail — not verified onchain anymore
// Format: keccak256(intentHash + wallet + verdict + calldata)
function buildSigningMessage(
  intentHash: string,
  wallet: string,
  verdict: string,
  calldata: string,
): Uint8Array {
  const messageHash = ethers.solidityPackedKeccak256(
    ["bytes32", "address", "string", "bytes32"],
    [
      ethers.zeroPadValue(ethers.getBytes(intentHash), 32),
      wallet,
      verdict,
      ethers.zeroPadValue(ethers.keccak256(ethers.toUtf8Bytes(calldata)), 32),
    ],
  );
  return ethers.getBytes(messageHash);
}

export async function issueAttestation(
  intentId: string,
  chain: string = "somnia-testnet",
): Promise<QuillProof> {
  const record = getRecord(intentId);

  if (record.status !== "VERIFIED") {
    throw new Error(
      `Cannot attest record in status: ${record.status}. Expected: VERIFIED`,
    );
  }

  if (!record.verdict || !record.calldata) {
    throw new Error("Record missing verdict or calldata");
  }

  const proofId = uuidv4();
  const signingWallet = getSigningWallet();

  const messageBytes = buildSigningMessage(
    record.intentHash,
    record.wallet,
    record.verdict.verdict,
    record.calldata,
  );

  const quillSig = await signingWallet.signMessage(messageBytes);

  const proof: QuillProof = {
    proofId,
    intentId: record.intentId,
    intentHash: record.intentHash,
    wallet: record.wallet,
    verdict: record.verdict,
    calldata: record.calldata,
    chain,
    selectedPool: record.selectedPool ?? "",
    selectedPoolId: record.selectedPoolId ?? 0,
    safetyPrompt: record.safetyPrompt ?? "",
    poolPrompt: record.poolPrompt ?? "",
    approvalSig: record.approvalSig,
    quillSig,
    issuedAt: Math.floor(Date.now() / 1000),
    amountRaw: record.amountRaw ?? BigInt(0),
    intentText: record.intentText ?? "",
    slippageBps: record.slippageBps ?? 50,
  };

  saveProof(proof);
  updateRecord(intentId, {
    status: "ATTESTED",
    attestedAt: Date.now(),
    quillProofId: proofId,
  });

  return proof;
}

export async function verifyProofSignature(
  proof: QuillProof,
): Promise<boolean> {
  try {
    const signingWallet = getSigningWallet();
    const messageBytes = buildSigningMessage(
      proof.intentHash,
      proof.wallet,
      proof.verdict.verdict,
      proof.calldata,
    );
    const recovered = ethers.verifyMessage(messageBytes, proof.quillSig);
    return recovered.toLowerCase() === signingWallet.address.toLowerCase();
  } catch {
    return false;
  }
}
