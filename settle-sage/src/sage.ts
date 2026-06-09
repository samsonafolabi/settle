// settle-sage/src/sage.ts
import "dotenv/config";
import {
  SageInput,
  SageOutput,
  SageAction,
  LLMResponse,
  DepositAction,
  RebalanceAction,
  Pool,
} from "./types";
import { fetchPools } from "./apyfeed";
import { callGroq } from "./groq";
import { callGemini } from "./gemini";
import { buildCalldata } from "./calldata";

const USDC_DECIMALS = 6;

function toRaw(amount: number): bigint {
  return BigInt(Math.round(amount * 10 ** USDC_DECIMALS));
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

// Build the safety prompt Accord uses for call 1
// Tells Accord: is this deposit safe? Does pool match intent?
function buildSafetyPrompt(
  action: SageAction,
  pools: Pool[],
  intentText: string,
): string {
  if (action.type !== "deposit") return "";

  const dep = action as DepositAction;
  const pool = pools.find((p) => p.index === dep.poolIndex);
  if (!pool) return "";

  const poolList = pools
    .map((p) => `${p.name} ${p.apy.toFixed(2)}% ${p.risk}`)
    .join(", ");

  return (
    `Is depositing ${dep.amount} USDC into ${pool.name} at ${pool.apy.toFixed(2)}% APY ` +
    `safe and appropriate for this user intent: "${intentText}"? ` +
    `Available pools: ${poolList}. ` +
    `Return EXECUTE if safe and appropriate. Return BLOCKED if there is a clear risk or intent mismatch.`
  );
}

// Build the pool prompt Accord uses for call 2
// Tells Accord: is this still the best pool? Override if not.
function buildPoolPrompt(
  action: SageAction,
  pools: Pool[],
  intentText: string,
): string {
  if (action.type !== "deposit") return "";

  const dep = action as DepositAction;
  const pool = pools.find((p) => p.index === dep.poolIndex);
  if (!pool) return "";

  const poolList = pools
    .map((p) => `${p.name} ${p.apy.toFixed(2)}% ${p.risk}`)
    .join(", ");

  return (
    `Given this intent: "${intentText}", which pool index is best? ` +
    `0=${pools[0].name} ${pools[0].apy}% ${pools[0].risk}, ` +
    `1=${pools[1].name} ${pools[1].apy}% ${pools[1].risk}, ` +
    `2=${pools[2].name} ${pools[2].apy}% ${pools[2].risk}. ` +
    `Return only the number 0, 1, or 2.`
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
      throw new Error(
        `Both LLMs failed.\nGroq: ${groqError}\nGemini: ${geminiError}`,
      );
    }
  }
}

export async function processIntent(input: SageInput): Promise<SageOutput> {
  // Fetch live pools if not provided
  if (!input.context.pools || input.context.pools.length === 0) {
    input.context.pools = await fetchPools();
  }

  const llmResponse = await callLLM(input);
  const action = buildAction(llmResponse, input);
  const calldata = buildCalldata(action);

  const amountRaw =
    action.type === "deposit" || action.type === "withdraw"
      ? action.amountRaw
      : BigInt(0);

  const slippageBps =
    action.type === "deposit" || action.type === "rebalance"
      ? action.slippageBps
      : 50;

  // poolId for vault (uint8) — use poolIndex from action
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

  // Build Accord prompts — passed to vault as calldata
  const safetyPrompt = buildSafetyPrompt(
    action,
    input.context.pools,
    llmResponse.intentText,
  );
  const poolPrompt = buildPoolPrompt(
    action,
    input.context.pools,
    llmResponse.intentText,
  );

  return {
    amountRaw,
    intentText: llmResponse.intentText,
    slippageBps,
    selectedPool: selectedPoolName,
    selectedPoolId,
    safetyPrompt,
    poolPrompt,
    calldata,
    action,
    reasoning: llmResponse.reasoning,
    confidence: llmResponse.confidence,
    requiresConfirmation: llmResponse.confidence === "LOW",
  };
}
