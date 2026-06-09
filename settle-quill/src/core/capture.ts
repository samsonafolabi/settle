// src/core/capture.ts
// Stage 1 — Intent Capture
// Pure computation — no network calls, no async
// This is the fastest function in Quill by design
// Intent is hashed the moment the user gives it
// Nothing can alter what was captured here

import { ethers } from "ethers";
import { v4 as uuidv4 } from "uuid";
import { IntentRecord } from "../types/IntentRecord";

export function captureIntent(intent: string, wallet: string): IntentRecord {
  // Validate inputs early — fail fast, no wasted work
  if (!intent || intent.trim().length === 0) {
    throw new Error("Intent cannot be empty");
  }

  if (!ethers.isAddress(wallet)) {
    throw new Error(`Invalid wallet address: ${wallet}`);
  }

  const intentId = uuidv4();
  const captureTime = Date.now();

  // Deterministic hash — same inputs always produce same hash
  // keccak256 matches what Solidity will verify onchain
  const intentHash = ethers.keccak256(
    ethers.toUtf8Bytes(`${intent}:${wallet.toLowerCase()}:${captureTime}`),
  );

  const record: IntentRecord = {
    intentId,
    intentHash,
    intent: intent.trim(),
    wallet: wallet.toLowerCase(),
    captureTime,
    status: "CAPTURED",
  };

  return record;
}
