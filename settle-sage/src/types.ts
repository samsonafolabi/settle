// settle-sage/src/types.ts
// All types for Sage — input, output, and actions
// These flow downstream into QuillProof, Sentry, and the vault call

// ── Pool — comes from APYFeed contract ─────────────────────
export type Pool = {
  name: string;
  apy: number; // human readable (5.20)
  apyBps: number; // raw basis points (520)
  risk: "LOW" | "MED" | "HIGH";
  index: number;
};

// ── Current user position ───────────────────────────────────
export type CurrentPosition = {
  pool: string;
  amountRaw: bigint; // USDC base units (6 decimals)
  apy: number; // human readable
};

// ── Sage input ──────────────────────────────────────────────
export type SageInput = {
  intent: string; // raw user instruction
  wallet: string; // user wallet address
  context: {
    balanceRaw: bigint; // available USDC in base units
    pools: Pool[]; // live from APYFeed
    currentPosition?: CurrentPosition; // undefined if no position yet
  };
};

// ── Actions Sage can build ──────────────────────────────────
export type DepositAction = {
  type: "deposit";
  amount: number; // human readable (500)
  amountRaw: bigint; // base units (500_000_000)
  pool: string; // pool name
  poolIndex: number;
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

// ── Sage output ─────────────────────────────────────────────
export type SageOutput = {
  // For vault call
  amountRaw: bigint; // USDC base units
  intentText: string; // clean string vault + Accord see
  slippageBps: number;

  // For QuillProof
  calldata: string; // hex encoded action
  action: SageAction;

  // For agent monitor feed
  reasoning: string;

  // Confidence
  confidence: "HIGH" | "MEDIUM" | "LOW";
  requiresConfirmation: boolean; // true if LOW confidence
};

// ── Gemini raw response ─────────────────────────────────────
// What we expect the LLM to return as JSON
// Validated before building SageOutput
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
