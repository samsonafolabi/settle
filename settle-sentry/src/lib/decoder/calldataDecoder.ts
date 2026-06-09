// settle-sentry/src/lib/decoder/calldataDecoder.ts
import { ethers } from "ethers";
import { DecodedCalldata } from "@/types";

const abiCoder = ethers.AbiCoder.defaultAbiCoder();

export function decodeCalldata(
  calldata: string,
  actionType: string,
): DecodedCalldata {
  try {
    switch (actionType) {
      case "deposit": {
        // Vault takes: deposit(uint256 amount, uint8 poolId, string intentText, ...)
        // Sage calldata encodes: [string pool, uint256 amountRaw, uint256 slippageBps]
        // We decode Sage's calldata format here
        const [pool, amountRaw, slippageBps] = abiCoder.decode(
          ["string", "uint256", "uint256"],
          calldata,
        );
        return {
          type: "deposit",
          pool: pool as string,
          amountRaw: amountRaw as bigint,
          slippageBps: Number(slippageBps),
        };
      }

      case "withdraw": {
        const [amountRaw] = abiCoder.decode(["uint256"], calldata);
        return { type: "withdraw", amountRaw: amountRaw as bigint };
      }

      case "rebalance": {
        const [fromPool, toPool, slippageBps] = abiCoder.decode(
          ["string", "string", "uint256"],
          calldata,
        );
        return {
          type: "rebalance",
          fromPool: fromPool as string,
          toPool: toPool as string,
          slippageBps: Number(slippageBps),
        };
      }

      default:
        return { type: "unknown" };
    }
  } catch {
    return { type: "unknown" };
  }
}
