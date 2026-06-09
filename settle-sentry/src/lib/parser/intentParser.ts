// settle-sentry/src/lib/parser/intentParser.ts
// Parses raw intent string into structured keywords
// Groq primary — understands natural language variations
// Regex fallback — handles structured intents when Groq is down
// Both return the same ParsedKeywords shape

import Groq from "groq-sdk";

export type ParsedKeywords = {
  actionType: "deposit" | "withdraw" | "rebalance" | "unknown";
  mentionedAmount: number | null;
  mentionedPool: string | null;
  riskPreference: "LOW" | "MED" | "HIGH" | null;
  mentionsBestYield: boolean;
};

// ── Groq parsing ────────────────────────────────────────────
const SYSTEM = `You are a DeFi intent parser. 
Extract structured data from user intent strings.
Return ONLY valid JSON, no markdown, no explanation.

Known pools: SETTLE_POOL_A (LOW risk), SETTLE_POOL_B (MED risk), SETTLE_POOL_C (HIGH risk)

Response schema:
{
  "actionType": "deposit" | "withdraw" | "rebalance" | "unknown",
  "mentionedAmount": number | null,
  "mentionedPool": "SETTLE_POOL_A" | "SETTLE_POOL_B" | "SETTLE_POOL_C" | null,
  "riskPreference": "LOW" | "MED" | "HIGH" | null,
  "mentionsBestYield": boolean
}`;

async function parseWithGroq(intent: string): Promise<ParsedKeywords> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY not set");

  const groq = new Groq({ apiKey });

  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    temperature: 0,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: `Parse this intent: "${intent}"` },
    ],
  });

  const text = completion.choices[0]?.message?.content?.trim() ?? "";
  const clean = text.replace(/```json|```/g, "").trim();

  return JSON.parse(clean) as ParsedKeywords;
}

// ── Regex fallback ──────────────────────────────────────────
function parseWithRegex(intent: string): ParsedKeywords {
  const lower = intent.toLowerCase();

  // Action type
  let actionType: ParsedKeywords["actionType"] = "unknown";
  if (/deposit|add|put|save|invest/.test(lower)) actionType = "deposit";
  if (/withdraw|take|remove|pull/.test(lower)) actionType = "withdraw";
  if (/rebalance|move|switch|transfer/.test(lower)) actionType = "rebalance";

  // Amount — number followed by USDC or standalone number
  const amountMatch = lower.match(/(\d+(?:\.\d+)?)\s*usdc?/);
  const standaloneMatch = lower.match(/\b(\d+(?:\.\d+)?)\b/);
  const mentionedAmount = amountMatch
    ? parseFloat(amountMatch[1])
    : standaloneMatch
      ? parseFloat(standaloneMatch[1])
      : null;

  // Pool name
  const poolMatch = intent.match(/SETTLE_POOL_[ABC]/i);
  const mentionedPool = poolMatch ? poolMatch[0].toUpperCase() : null;

  // Risk preference
  let riskPreference: ParsedKeywords["riskPreference"] = null;
  if (/low.?risk|safe|conservative/.test(lower)) riskPreference = "LOW";
  if (/med.?risk|medium|balanced/.test(lower)) riskPreference = "MED";
  if (/high.?risk|aggressive|max.?yield/.test(lower)) riskPreference = "HIGH";

  // Best yield
  const mentionsBestYield = /best|highest|most|top/.test(lower);

  return {
    actionType,
    mentionedAmount,
    mentionedPool,
    riskPreference,
    mentionsBestYield,
  };
}

// ── Main export ─────────────────────────────────────────────
export async function parseIntent(intent: string): Promise<ParsedKeywords> {
  // Groq first — understands natural language
  try {
    return await parseWithGroq(intent);
  } catch (err) {
    console.warn("Groq parsing failed — falling back to regex:", err);
    return parseWithRegex(intent);
  }
}
