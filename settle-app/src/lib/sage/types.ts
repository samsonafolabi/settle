// settle-sage/src/types.ts

export type Pool = {
  name: string;
  apy: number; // human readable (5.20)
  apyBps: number; // raw basis points (520)
  risk: "LOW" | "MED" | "HIGH";
  index: number; // poolId for vault (uint8)
};

export type CurrentPosition = {
  pool: string;
  poolId: number;
  amountRaw: bigint;
  apy: number;
};

export type SageInput = {
  intent: string;
  wallet: string;
  context: {
    balanceRaw: bigint;
    pools: Pool[];
    currentPosition?: CurrentPosition;
  };
};

export type DepositAction = {
  type: "deposit";
  amount: number;
  amountRaw: bigint;
  pool: string;
  poolIndex: number; // uint8 poolId for vault
  slippageBps: number;
};

export type WithdrawAction = {
  type: "withdraw";
  amount: number;
  amountRaw: bigint;
};

export type RebalanceAction = {
  type: "rebalance";
  fromPool: string;
  toPool: string;
  toPoolIndex: number;
  slippageBps: number;
};

export type UnknownAction = {
  type: "unknown";
  rawIntent: string;
};

export type SageAction =
  | DepositAction
  | WithdrawAction
  | RebalanceAction
  | UnknownAction;

export type SageOutput = {
  // Vault call params
  amountRaw: bigint;
  intentText: string;
  slippageBps: number;
  selectedPool: string; // pool name — for display
  selectedPoolId: number; // uint8 poolId — for vault.deposit()
  safetyPrompt: string; // Accord call 1 — built by Sage, passed as calldata
  poolPrompt: string; // Accord call 2 — built by Sage, passed as calldata

  // For Sentry
  calldata: string;
  action: SageAction;

  // For display
  reasoning: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  requiresConfirmation: boolean;
};

export type LLMResponse = {
  action: {
    type: "deposit" | "withdraw" | "rebalance" | "unknown";
    amount?: number;
    pool?: string;
    poolIndex?: number;
    fromPool?: string;
    toPool?: string;
    toPoolIndex?: number;
    slippageBps?: number;
  };
  intentText: string;
  reasoning: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
};
