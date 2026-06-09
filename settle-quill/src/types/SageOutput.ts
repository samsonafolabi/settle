// src/types/SageOutput.ts
// Kept in sync with settle-sage/src/types.ts manually
// Post hackathon: extract to shared package

export type SageAction =
  | {
      type: "deposit";
      amount: number;
      amountRaw: bigint;
      pool: string;
      poolIndex: number; // uint8 poolId for vault
      slippageBps: number;
    }
  | { type: "withdraw"; amount: number; amountRaw: bigint }
  | {
      type: "rebalance";
      fromPool: string;
      toPool: string;
      toPoolIndex: number;
      slippageBps: number;
    }
  | { type: "unknown"; rawIntent: string };

export type SageOutput = {
  amountRaw: bigint;
  intentText: string;
  slippageBps: number;
  selectedPool: string; // pool name — for display
  selectedPoolId: number; // uint8 poolId — for vault.deposit()
  safetyPrompt: string; // Accord call 1 prompt
  poolPrompt: string; // Accord call 2 prompt
  calldata: string;
  action: SageAction;
  reasoning: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  requiresConfirmation: boolean;
};
