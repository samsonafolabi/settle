export type PoolRisk = "LOW" | "MED" | "HIGH";

export type PoolMeta = {
  id: number;
  name: string;
  apy: number;
  apyBps: number;
  risk: PoolRisk;
};

export type IntentPolicyAnalysis = {
  expectedPool?: PoolMeta;
  expectedReason?: string;
  mismatch: boolean;
  policyLabel?: string;
};

export const SETTLE_POOLS: PoolMeta[] = [
  { id: 0, name: "SETTLE_POOL_A", apy: 5.2, apyBps: 520, risk: "LOW" },
  { id: 1, name: "SETTLE_POOL_B", apy: 8.71, apyBps: 871, risk: "MED" },
  { id: 2, name: "SETTLE_POOL_C", apy: 12.4, apyBps: 1240, risk: "HIGH" },
];

export function poolById(poolId?: number): PoolMeta | undefined {
  return SETTLE_POOLS.find((pool) => pool.id === poolId);
}

export function poolByName(poolName?: string): PoolMeta | undefined {
  if (!poolName) return undefined;

  return SETTLE_POOLS.find((pool) => pool.name === poolName);
}

export function poolApyLabel(poolId?: number, poolName?: string): string {
  const pool = poolById(poolId) ?? poolByName(poolName);

  return pool ? `${pool.apy.toFixed(2)}%` : "—";
}

export function poolRiskLabel(poolId?: number, poolName?: string): PoolRisk {
  return (poolById(poolId) ?? poolByName(poolName))?.risk ?? "HIGH";
}


function highestApyPool() {
  return SETTLE_POOLS.reduce((best, pool) =>
    pool.apy > best.apy ? pool : best,
  );
}

function safestPool() {
  const riskOrder: Record<PoolRisk, number> = { LOW: 0, MED: 1, HIGH: 2 };

  return SETTLE_POOLS.reduce((best, pool) => {
    const poolRisk = riskOrder[pool.risk];
    const bestRisk = riskOrder[best.risk];

    if (poolRisk < bestRisk) return pool;
    if (poolRisk === bestRisk && pool.apy > best.apy) return pool;

    return best;
  });
}

function balancedPool() {
  const eligible = SETTLE_POOLS.filter((pool) => pool.risk !== "HIGH");

  return eligible.reduce((best, pool) => (pool.apy > best.apy ? pool : best));
}

function explicitPoolMention(text: string): PoolMeta | undefined {
  const match = text.match(/SETTLE_POOL_[ABC]/i);
  if (!match) return undefined;

  return poolByName(match[0].toUpperCase());
}

export function expectedPoolFromIntent(intentText: string): {
  pool?: PoolMeta;
  reason?: string;
  policyLabel?: string;
} {
  const text = intentText.toLowerCase();

  const explicit = explicitPoolMention(intentText);
  if (explicit) {
    return {
      pool: explicit,
      reason: `User intent explicitly referenced ${explicit.name}.`,
      policyLabel: "EXPLICIT_POOL",
    };
  }


  if (
    text.includes("highest yield") ||
    text.includes("highest apy") ||
    text.includes("highest return") ||
    text.includes("highest returns") ||
    text.includes("maximize") ||
    text.includes("maximise") ||
    text.includes("maximum yield") ||
    text.includes("max yield")
  ) {
    const pool = highestApyPool();

    return {
      pool,
      reason: `User asked for highest yield, so expected ${pool.name} at ${pool.apy.toFixed(2)}% APY.`,
      policyLabel: "HIGHEST_YIELD",
    };
  }

  if (
    text.includes("safest") ||
    text.includes("safe") ||
    text.includes("lowest risk") ||
    text.includes("low risk") ||
    text.includes("conservative")
  ) {
    const pool = safestPool();

    return {
      pool,
      reason: `User asked for the safest/lowest-risk option, so expected ${pool.name} with ${pool.risk} risk.`,
      policyLabel: "SAFEST",
    };
  }

  if (
    text.includes("balanced") ||
    text.includes("risk-adjusted") ||
    text.includes("moderate") ||
    text.includes("medium risk")
  ) {
    const pool = balancedPool();

    return {
      pool,
      reason: `User asked for a balanced option, so expected best APY among LOW/MED risk pools: ${pool.name}.`,
      policyLabel: "BALANCED",
    };
  }

  return {};
}

export function analyzeReceiptPolicy(
  intentText: string,
  finalPoolId?: number,
  finalPoolName?: string,
): IntentPolicyAnalysis {
  const finalPool = poolById(finalPoolId) ?? poolByName(finalPoolName);
  const expected = expectedPoolFromIntent(intentText);

  if (!expected.pool || !finalPool) {
    return {
      expectedPool: expected.pool,
      expectedReason: expected.reason,
      policyLabel: expected.policyLabel,
      mismatch: false,
    };
  }

  return {
    expectedPool: expected.pool,
    expectedReason: expected.reason,
    policyLabel: expected.policyLabel,
    mismatch: expected.pool.id !== finalPool.id,
  };
}
