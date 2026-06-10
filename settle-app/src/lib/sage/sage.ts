import {
  SageInput,
  SageOutput,
  SageAction,
  LLMResponse,
  DepositAction,
  RebalanceAction,
  Pool,
} from "./types";
import { fetchPools, bestPool, bestPoolForRisk } from "./apyfeed";
import { callGroq } from "./groq";
import { callGemini } from "./gemini";
import { buildCalldata } from "./calldata";

const USDC_DECIMALS = 6;

function toRaw(amount: number): bigint {
  return BigInt(Math.round(amount * 10 ** USDC_DECIMALS));
}

function findPoolByIndex(pools: Pool[], index: number): Pool | undefined {
  return pools.find((p) => p.index === index);
}

function parseAmount(intent: string): number | null {
  const match = intent.match(/(\d+(?:\.\d+)?)\s*(?:usdc)?/i);
  if (!match) return null;

  const amount = Number(match[1]);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function isSafetyIntent(text?: string): boolean {
  const t = (text ?? "").toLowerCase();

  return (
    t.includes("safest") ||
    t.includes("safe") ||
    t.includes("low risk") ||
    t.includes("lowest risk") ||
    t.includes("conservative")
  );
}

function isBalancedIntent(text?: string): boolean {
  const t = (text ?? "").toLowerCase();

  return (
    t.includes("medium") ||
    t.includes("balanced") ||
    t.includes("risk-adjusted") ||
    t.includes("moderate")
  );
}

function buildDeterministicResponse(input: SageInput): LLMResponse {
  const originalText = input.intent ?? "";
  const intent = originalText.toLowerCase();
  const pools = input.context.pools;

  if (pools.length === 0) {
    return {
      action: { type: "unknown" },
      intentText: originalText,
      reasoning: "No pools were available.",
      confidence: "LOW",
    };
  }

  if (intent.includes("withdraw")) {
    const amount = parseAmount(originalText);

    return amount
      ? {
          action: {
            type: "withdraw",
            amount,
          },
          intentText: `Withdraw ${amount} USDC from Settle.`,
          reasoning:
            "The intent contains a withdraw instruction and a valid amount.",
          confidence: "HIGH",
        }
      : {
          action: { type: "unknown" },
          intentText: originalText,
          reasoning: "Withdraw intent did not include a valid amount.",
          confidence: "LOW",
        };
  }

  const isDeposit =
    intent.includes("deposit") ||
    intent.includes("save") ||
    intent.includes("invest") ||
    intent.includes("put");

  if (!isDeposit) {
    return {
      action: { type: "unknown" },
      intentText: originalText,
      reasoning:
        "The intent did not clearly map to a supported deposit action.",
      confidence: "LOW",
    };
  }

  const amount = parseAmount(originalText);
  if (!amount) {
    return {
      action: { type: "unknown" },
      intentText: originalText,
      reasoning: "Deposit intent did not include a valid amount.",
      confidence: "LOW",
    };
  }

  let selected: Pool;
  let reasoning: string;

  if (isSafetyIntent(intent)) {
    selected = safestPool(pools);
    reasoning =
      "The user asked for the safest/lowest-risk pool, so Sage selected the lowest-risk active pool.";
  } else if (isBalancedIntent(intent)) {
    selected = bestPoolForRisk(pools, "MED");
    reasoning =
      "The user asked for a balanced/risk-adjusted pool, so Sage selected the best APY among LOW or MED risk pools.";
  } else {
    selected = bestPool(pools);
    reasoning =
      "The user asked for the best yield, so Sage selected the highest-APY active pool.";
  }

  return {
    action: {
      type: "deposit",
      amount,
      pool: selected.name,
      poolIndex: selected.index,
      slippageBps: 50,
    },
    intentText: `Deposit ${amount} USDC into ${selected.name} yielding ${selected.apy.toFixed(2)}% APY`,
    reasoning,
    confidence: "HIGH",
  };
}

function buildAction(llm: LLMResponse, input: SageInput): SageAction {
  const { action } = llm;

  switch (action.type) {
    case "deposit": {
      if (!action.amount || !action.pool || action.poolIndex === undefined) {
        throw new Error("Deposit action missing amount, pool, or poolIndex");
      }

      return {
        type: "deposit",
        amount: action.amount,
        amountRaw: toRaw(action.amount),
        pool: action.pool,
        poolIndex: action.poolIndex,
        slippageBps: action.slippageBps ?? 50,
      };
    }

    case "withdraw": {
      if (!action.amount) throw new Error("Withdraw action missing amount");

      return {
        type: "withdraw",
        amount: action.amount,
        amountRaw: toRaw(action.amount),
      };
    }

    case "rebalance": {
      if (
        !action.fromPool ||
        !action.toPool ||
        action.toPoolIndex === undefined
      ) {
        throw new Error("Rebalance action missing pool info");
      }

      return {
        type: "rebalance",
        fromPool: action.fromPool,
        toPool: action.toPool,
        toPoolIndex: action.toPoolIndex,
        slippageBps: action.slippageBps ?? 50,
      };
    }

    default:
      return { type: "unknown", rawIntent: input.intent };
  }
}

// Accord call 1: safety check.
// This prompt now includes the ORIGINAL user intent, not only the cleaned intentText.
// That matters because cleaned text may lose words like "safest".
type IntentPolicyName =
  | "EXACT_POOL"
  | "SAFEST"
  | "BALANCED"
  | "HIGHEST_YIELD"
  | "SELECTED_POOL";

type PoolDecision = {
  pool: Pool;
  policy: IntentPolicyName;
  reason: string;
};

const RISK_RANK: Record<Pool["risk"], number> = {
  LOW: 0,
  MED: 1,
  HIGH: 2,
};

function getActivePools(pools: Pool[]): Pool[] {
  // APYFeed pools in this project are already active by the time they reach Sage.
  // Keep this wrapper so the policy resolver has one safe place to evolve later.
  return pools.filter(Boolean);
}

function findExplicitPool(intentText: string, pools: Pool[]): Pool | undefined {
  const text = (intentText ?? "").toUpperCase();

  return pools.find((pool) => {
    const poolName = pool.name.toUpperCase();
    const letter = poolName.replace("SETTLE_POOL_", "");
    const indexText = String(pool.index);

    return (
      text.includes(poolName) ||
      text.includes(`POOL ${letter}`) ||
      text.includes(`POOL_${letter}`) ||
      text.includes(`POOL #${indexText}`) ||
      text.includes(`POOL ${indexText}`)
    );
  });
}

function highestYieldPool(pools: Pool[]): Pool {
  return pools.reduce((best, pool) => (pool.apy > best.apy ? pool : best));
}

function safestPool(pools: Pool[]): Pool {
  return pools.reduce((best, pool) => {
    const poolRisk = RISK_RANK[pool.risk];
    const bestRisk = RISK_RANK[best.risk];

    if (poolRisk < bestRisk) return pool;
    if (poolRisk === bestRisk && pool.apy > best.apy) return pool;

    return best;
  });
}

function balancedPool(pools: Pool[]): Pool {
  const nonHighRiskPools = pools.filter((pool) => pool.risk !== "HIGH");

  if (nonHighRiskPools.length === 0) {
    return safestPool(pools);
  }

  return nonHighRiskPools.reduce((best, pool) =>
    pool.apy > best.apy ? pool : best,
  );
}

function resolvePoolDecision(
  intentText: string,
  selectedPool: Pool,
  pools: Pool[],
): PoolDecision {
  const activePools = getActivePools(pools);
  const safeIntentText = intentText ?? "";
  const intent = safeIntentText.toLowerCase();

  const explicitPool = findExplicitPool(intentText, activePools);
  if (explicitPool) {
    return {
      pool: explicitPool,
      policy: "EXACT_POOL",
      reason: `User explicitly requested ${explicitPool.name}; exact pool requests are hard-locked.`,
    };
  }

  if (
    intent.includes("highest yield") ||
    intent.includes("highest apy") ||
    intent.includes("highest return") ||
    intent.includes("highest returns") ||
    intent.includes("maximize") ||
    intent.includes("maximise") ||
    intent.includes("max yield")
  ) {
    const pool = highestYieldPool(activePools);

    return {
      pool,
      policy: "HIGHEST_YIELD",
      reason: `Highest-yield strategy selected ${pool.name}, the current highest APY pool.`,
    };
  }

  if (
    intent.includes("safest") ||
    intent.includes("safe") ||
    intent.includes("lowest risk") ||
    intent.includes("low risk") ||
    intent.includes("conservative")
  ) {
    const pool = safestPool(activePools);

    return {
      pool,
      policy: "SAFEST",
      reason: `Safest strategy selected ${pool.name}, the lowest-risk eligible pool.`,
    };
  }

  if (
    intent.includes("balanced") ||
    intent.includes("risk-adjusted") ||
    intent.includes("moderate") ||
    intent.includes("medium risk")
  ) {
    const pool = balancedPool(activePools);

    return {
      pool,
      policy: "BALANCED",
      reason: `Balanced strategy selected ${pool.name}, the best APY among non-HIGH-risk pools.`,
    };
  }

  return {
    pool: selectedPool,
    policy: "SELECTED_POOL",
    reason: `Using Sage's selected pool: ${selectedPool.name}.`,
  };
}

function applyDeterministicPolicyOverride(
  action: SageAction,
  originalIntent: string,
  pools: Pool[],
): { action: SageAction; decision?: PoolDecision } {
  if (action.type !== "deposit") {
    return { action };
  }

  const dep = action as DepositAction;
  const selectedPool = findPoolByIndex(pools, dep.poolIndex);

  if (!selectedPool) {
    return { action };
  }

  const decision = resolvePoolDecision(originalIntent, selectedPool, pools);

  return {
    action: {
      ...dep,
      pool: decision.pool.name,
      poolIndex: decision.pool.index,
    },
    decision,
  };
}

function buildSafetyPrompt(
  action: SageAction,
  pools: Pool[],
  intentText: string,
  originalIntent: string,
): string {
  if (action.type !== "deposit") return "";

  const dep = action as DepositAction;
  const pool = findPoolByIndex(pools, dep.poolIndex);
  if (!pool) return "";

  const poolList = pools
    .map((p) => `${p.index}=${p.name} ${p.apy.toFixed(2)}% ${p.risk} risk`)
    .join(", ");

  const hardConstraint = isSafetyIntent(originalIntent)
    ? `HARD USER CONSTRAINT: the user asked for the safest/low-risk option. ` +
      `A MED or HIGH risk pool violates the user's intent even if it has higher APY. `
    : isBalancedIntent(originalIntent)
      ? `HARD USER CONSTRAINT: the user asked for a balanced/risk-adjusted option. ` +
        `Do not approve a HIGH risk pool unless the user explicitly requested high yield. `
      : "";

  return (
    `Original user intent: "${originalIntent}". ` +
    `Parsed intent: "${intentText}". ` +
    `${hardConstraint}` +
    `Proposed action: deposit ${dep.amount} USDC into pool ${pool.index} (${pool.name}) ` +
    `at ${pool.apy.toFixed(2)}% APY, ${pool.risk} risk. ` +
    `Available active pools: ${poolList}. ` +
    `Return EXECUTE if the proposed action is safe and respects all user constraints. ` +
    `Return BLOCKED if the proposed action violates the user's risk preference, amount, pool constraint, or safety requirements.`
  );
}

// Accord call 2: pool validation.
// Important: this is no longer "pick the highest APY blindly".
// It constrains Accord to validate within the user's stated risk policy.
// Build the pool prompt Accord uses for call 2
// Tells Accord: validate or reselect within the user's policy boundary.
// IMPORTANT: explicit pool requests are hard-locked. Accord must not optimize them away.
// Build the pool prompt Accord uses for call 2
// Tells Accord: validate or reselect within the user's policy boundary.
// IMPORTANT: explicit pool requests are hard-locked. Accord must not optimize them away.
function buildPoolPrompt(
  action: SageAction,
  pools: Pool[],
  intentText: string,
): string {
  if (action.type !== "deposit") return "";

  const dep = action as DepositAction;
  const selectedPool = pools.find((p) => p.index === dep.poolIndex);
  if (!selectedPool) return "";

  const decision = resolvePoolDecision(intentText, selectedPool, pools);

  const poolList = getActivePools(pools)
    .map((p) => `${p.index}=${p.name} ${p.apy.toFixed(2)}% ${p.risk} risk`)
    .join(", ");

  return (
    `User intent: "${intentText}". ` +
    `Policy: ${decision.policy}. ` +
    `${decision.reason} ` +
    `Available pools: ${poolList}. ` +
    `Expected pool: ${decision.pool.index}=${decision.pool.name}. ` +
    `You are validating the user's policy boundary, not freely optimizing. ` +
    `Do not choose any pool outside the policy. ` +
    `Return exactly the single number ${decision.pool.index}. ` +
    `Do not return explanations, words, JSON, or any other number.`
  );
}

async function callLLM(input: SageInput): Promise<LLMResponse> {
  try {
    return await callGroq(input);
  } catch (groqError) {
    console.warn("Groq failed — falling back to Gemini:", groqError);

    try {
      return await callGemini(input);
    } catch (geminiError) {
      console.warn(
        "Both LLMs failed — using deterministic Sage fallback:",
        groqError,
        geminiError,
      );

      return buildDeterministicResponse(input);
    }
  }
}

export async function processIntent(input: SageInput): Promise<SageOutput> {
  // Fetch live pools if not provided
  if (!input.context.pools || input.context.pools.length === 0) {
    input.context.pools = await fetchPools();
  }

  const originalIntent = input.intent ?? "";
  const safeInput: SageInput = { ...input, intent: originalIntent };

  const llmResponse = await callLLM(safeInput);
  const builtAction = buildAction(llmResponse, safeInput);
  const { action, decision } = applyDeterministicPolicyOverride(
    builtAction,
    originalIntent,
    input.context.pools,
  );

  const calldata = buildCalldata(action);

  const amountRaw =
    action.type === "deposit" || action.type === "withdraw"
      ? action.amountRaw
      : BigInt(0);

  const slippageBps =
    action.type === "deposit" || action.type === "rebalance"
      ? action.slippageBps
      : 50;

  // poolId for vault (uint8) — after deterministic policy resolution
  const selectedPoolId: number =
    action.type === "deposit"
      ? (action as DepositAction).poolIndex
      : action.type === "rebalance"
        ? (action as RebalanceAction).toPoolIndex
        : 0;

  const selectedPoolName: string =
    action.type === "deposit"
      ? (action as DepositAction).pool
      : action.type === "rebalance"
        ? (action as RebalanceAction).toPool
        : "";

  // Build Accord prompts from the original user intent, not Sage's normalized text.
  const safetyPrompt = buildSafetyPrompt(
    action,
    input.context.pools,
    llmResponse.intentText,
    originalIntent,
  );
  const poolPrompt = buildPoolPrompt(
    action,
    input.context.pools,
    llmResponse.intentText,
  );

  const reasoning = decision?.reason ?? llmResponse.reasoning;

  return {
    amountRaw,
    // Store/display what the user actually asked, not the LLM-normalized sentence.
    intentText: originalIntent,
    slippageBps,
    selectedPool: selectedPoolName,
    selectedPoolId,
    safetyPrompt,
    poolPrompt,
    calldata,
    action,
    reasoning,
    confidence: llmResponse.confidence,
    requiresConfirmation: llmResponse.confidence === "LOW",
  };
}
