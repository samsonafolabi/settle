// settle-sage/src/sage.ts
// Main entry point — processIntent()
// Calls Gemini (with Groq fallback)
// Validates response, builds SageOutput

import "dotenv/config";
import { SageInput, SageOutput, SageAction, LLMResponse } from "./types";
import { fetchPools, bestPool } from "./apyfeed";
import { callGemini } from "./gemini";
import { callGroq } from "./groq";
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
      if (!action.amount) {
        throw new Error("Withdraw action missing amount");
      }
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
      return {
        type: "unknown",
        rawIntent: input.intent,
      };
  }
}

function getAmountRaw(action: SageAction): bigint {
  if (action.type === "deposit") return action.amountRaw;
  if (action.type === "withdraw") return action.amountRaw;
  return BigInt(0);
}

function getSlippageBps(action: SageAction): number {
  if (action.type === "deposit") return action.slippageBps;
  if (action.type === "rebalance") return action.slippageBps;
  return 50;
}

async function callLLM(input: SageInput): Promise<LLMResponse> {
  // Groq primary — fast and free
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

  // Call LLM with fallback
  const llmResponse = await callLLM(input);

  // Build structured action
  const action = buildAction(llmResponse, input);

  // Build calldata from action
  const calldata = buildCalldata(action);

  const amountRaw = getAmountRaw(action);
  const slippageBps = getSlippageBps(action);

  return {
    amountRaw,
    intentText: llmResponse.intentText,
    slippageBps,
    calldata,
    action,
    reasoning: llmResponse.reasoning,
    confidence: llmResponse.confidence,
    requiresConfirmation: llmResponse.confidence === "LOW",
  };
}
