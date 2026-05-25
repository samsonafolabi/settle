// settle-sage/src/groq.ts
// Fallback if Gemini fails
import "dotenv/config";
import Groq from "groq-sdk";
import { SageInput, LLMResponse } from "./types";

const SYSTEM = `You are Sage, a transaction builder for a DeFi yield app on Somnia.
Parse user intent and return ONLY valid JSON. No explanation, no markdown, no backticks.
Use pool names and indices exactly as provided.
Default slippageBps to 50 unless user specifies otherwise.
Set confidence LOW if intent is ambiguous.`;

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

Return ONLY valid JSON:
{
  "action": {
    "type": "deposit" | "withdraw" | "rebalance" | "unknown",
    "amount": number,
    "pool": "pool name",
    "poolIndex": number,
    "fromPool": "pool name",
    "toPool": "pool name", 
    "toPoolIndex": number,
    "slippageBps": number
  },
  "intentText": "clean one sentence description",
  "reasoning": "why you built this",
  "confidence": "HIGH" | "MEDIUM" | "LOW"
}`;
}

export async function callGroq(input: SageInput): Promise<LLMResponse> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY not set");

  const groq = new Groq({ apiKey });

  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: buildPrompt(input) },
    ],
    temperature: 0.1,
  });

  const text = completion.choices[0]?.message?.content?.trim() ?? "";
  const clean = text.replace(/```json|```/g, "").trim();

  try {
    return JSON.parse(clean) as LLMResponse;
  } catch {
    throw new Error(`Groq returned invalid JSON: ${clean}`);
  }
}
