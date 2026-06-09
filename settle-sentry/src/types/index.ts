// settle-sentry/src/types/index.ts

// ── Request — what frontend sends ──────────────────────────
export type SentryRequest = {
  intent: string; // raw user instruction
  intentText: string; // Sage's clean description
  action: {
    type: "deposit" | "withdraw" | "rebalance" | "unknown";
    amount?: number;
    amountRaw?: string; // bigint as string
    pool?: string; // pool name
    poolIndex?: number; // uint8 poolId for vault
    fromPool?: string;
    toPool?: string;
    toPoolIndex?: number;
    slippageBps?: number;
  };
  calldata: string;
  wallet: string;
  slippageBps: number;
  amountRaw: string; // bigint as string
  chain: string;
  selectedPool: string; // pool name Sage chose
  selectedPoolId: number; // uint8 poolId Sage chose
};

// ── Decoded calldata ────────────────────────────────────────
export type DecodedDeposit = {
  type: "deposit";
  pool: string; // pool name from calldata
  amountRaw: bigint;
  slippageBps: number;
};

export type DecodedWithdraw = {
  type: "withdraw";
  amountRaw: bigint;
};

export type DecodedRebalance = {
  type: "rebalance";
  fromPool: string;
  toPool: string;
  slippageBps: number;
};

export type DecodedCalldata =
  | DecodedDeposit
  | DecodedWithdraw
  | DecodedRebalance
  | { type: "unknown" };

// ── Verdict ─────────────────────────────────────────────────
export type VerdictResult = "EXECUTE" | "WARNING" | "BLOCKED";
export type RiskLevel = "NONE" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type Finding = {
  check: string;
  severity: RiskLevel;
  message: string;
};

export type Verdict = {
  verdict: VerdictResult;
  riskLevel: RiskLevel;
  summary: string;
  recommendation: string;
  details: string[];
  layers: {
    intentComparison: { passed: boolean; issues: string[] };
    securityLinter: { riskLevel: RiskLevel; findings: Finding[] };
  };
};

// ── Known pools ─────────────────────────────────────────────
export const KNOWN_POOLS = [
  "SETTLE_POOL_A",
  "SETTLE_POOL_B",
  "SETTLE_POOL_C",
] as const;

export const POOL_RISK: Record<string, "LOW" | "MED" | "HIGH"> = {
  SETTLE_POOL_A: "LOW",
  SETTLE_POOL_B: "MED",
  SETTLE_POOL_C: "HIGH",
};

export type KnownPool = (typeof KNOWN_POOLS)[number];

export function isKnownPool(name: string): boolean {
  return KNOWN_POOLS.includes(name as KnownPool);
}

export function isValidPoolId(id: number): boolean {
  return id >= 0 && id <= 2;
}
