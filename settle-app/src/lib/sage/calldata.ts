// settle-sage/src/calldata.ts
// Builds hex encoded calldata from a SageAction
// This is what gets stored in QuillProof and verified by Sentry

import { ethers } from "ethers";
import { SageAction } from "./types";

const abiCoder = ethers.AbiCoder.defaultAbiCoder();

export function buildCalldata(action: SageAction): string {
  switch (action.type) {
    case "deposit":
      return abiCoder.encode(
        ["string", "uint256", "uint256"],
        [action.pool, action.amountRaw, action.slippageBps],
      );

    case "withdraw":
      return abiCoder.encode(["uint256"], [action.amountRaw]);

    case "rebalance":
      return abiCoder.encode(
        ["string", "string", "uint256"],
        [action.fromPool, action.toPool, action.slippageBps],
      );

    case "unknown":
      return ethers.toUtf8Bytes(action.rawIntent).toString();

    default:
      throw new Error(`Unknown action type`);
  }
}
