// settle-sage/src/gemini.ts
import { GoogleGenerativeAI } from "@google/generative-ai";
import { SageInput, LLMResponse } from "./types";

function buildPrompt(input: SageInput): string {
  const { intent, context } = input;
  const balance = Number(context.balanceRaw) / 1_000_000;
  const pools = context.pools
    .map(
      (p) =>
        `{ name: "${p.name}", apy: ${p.apy}%, risk: "${p.risk}", index: ${p.index} }`,
    )
    .join("\n");

  const position = context.currentPosition
    ? `Current position: ${context.currentPosition.pool}, ${Number(context.currentPosition.amountRaw) / 1_000_000} USDC at ${context.currentPosition.apy}%`
    : "No current position";

  return `
User intent: "${intent}"
Available balance: ${balance} USDC
${position}

Available pools:
${pools}

Return ONLY valid JSON matching this schema exactly:
{
  "action": {
    "type": "deposit" | "withdraw" | "rebalance" | "unknown",
    "amount": number (if deposit/withdraw),
    "pool": "pool name" (if deposit),
    "poolIndex": number (if deposit),
    "fromPool": "pool name" (if rebalance),
    "toPool": "pool name" (if rebalance),
    "toPoolIndex": number (if rebalance),
    "slippageBps": number (default 50)
  },
  "intentText": "clean one sentence description",
  "reasoning": "why you built this action",
  "confidence": "HIGH" | "MEDIUM" | "LOW"
}`;
}

const SYSTEM = `You are Sage, a transaction builder for a DeFi yield app on Somnia.
Parse user intent and return ONLY valid JSON. No explanation, no markdown, no backticks.
Use pool names and indices exactly as provided.
Default slippageBps to 50 unless user specifies otherwise.
Set confidence LOW if intent is ambiguous.`;

export async function callGemini(input: SageInput): Promise<LLMResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    systemInstruction: SYSTEM,
  });

  const result = await model.generateContent(buildPrompt(input));
  const text = result.response.text().trim();

  // Strip markdown fences if model wraps response
  const clean = text.replace(/```json|```/g, "").trim();

  try {
    return JSON.parse(clean) as LLMResponse;
  } catch {
    throw new Error(`Gemini returned invalid JSON: ${clean}`);
  }
}
