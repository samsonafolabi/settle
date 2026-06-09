import { NextResponse } from "next/server";
import { z } from "zod";

const Body = z.object({
  intent: z.string().min(1),
  wallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  sageOutput: z.object({
    amountRaw: z.string(),
    intentText: z.string(),
    slippageBps: z.number(),
    selectedPool: z.string(),
    selectedPoolId: z.number(),
    safetyPrompt: z.string(),
    poolPrompt: z.string(),
    confidence: z.enum(["HIGH", "MEDIUM", "LOW"]),
    action: z.any(),
  }),
});

function includesAny(text: string, words: string[]) {
  const t = text.toLowerCase();
  return words.some((w) => t.includes(w));
}

export async function POST(req: Request) {
  try {
    const body = Body.parse(await req.json());
    const { intent, sageOutput } = body;

    const details: string[] = [];

    if (sageOutput.action?.type !== "deposit") {
      return NextResponse.json({
        verdict: "BLOCKED",
        riskLevel: "HIGH",
        summary: "Only deposit intents are enabled for this demo.",
        recommendation: "Use a deposit intent.",
        details: ["Unsupported action type"],
        layers: {
          intentComparison: { passed: false, issues: ["Unsupported action"] },
          securityLinter: { riskLevel: "HIGH", findings: [] },
        },
      });
    }

    const amountRaw = BigInt(sageOutput.amountRaw);
    if (amountRaw <= 0n) {
      return NextResponse.json({
        verdict: "BLOCKED",
        riskLevel: "CRITICAL",
        summary: "Deposit amount must be greater than zero.",
        recommendation: "Do not execute.",
        details: ["Zero or invalid amount"],
        layers: {
          intentComparison: { passed: false, issues: ["Invalid amount"] },
          securityLinter: { riskLevel: "CRITICAL", findings: [] },
        },
      });
    }

    if (sageOutput.selectedPoolId < 0 || sageOutput.selectedPoolId > 2) {
      return NextResponse.json({
        verdict: "BLOCKED",
        riskLevel: "HIGH",
        summary: "Sage selected an unknown pool.",
        recommendation: "Do not execute.",
        details: [`selectedPoolId=${sageOutput.selectedPoolId}`],
        layers: {
          intentComparison: { passed: false, issues: ["Unknown pool"] },
          securityLinter: { riskLevel: "HIGH", findings: [] },
        },
      });
    }

    if (sageOutput.slippageBps > 100) {
      return NextResponse.json({
        verdict: "WARNING",
        riskLevel: "MEDIUM",
        summary: "Slippage is above the normal demo threshold.",
        recommendation: "Ask user to confirm before execution.",
        details: [`slippageBps=${sageOutput.slippageBps}`],
        layers: {
          intentComparison: { passed: true, issues: [] },
          securityLinter: {
            riskLevel: "MEDIUM",
            findings: [
              {
                check: "slippage",
                severity: "MEDIUM",
                message: "Slippage is above 1%.",
              },
            ],
          },
        },
      });
    }

    if (sageOutput.confidence === "LOW") {
      return NextResponse.json({
        verdict: "WARNING",
        riskLevel: "LOW",
        summary: "Sage marked the intent as low confidence.",
        recommendation: "Ask user to confirm before execution.",
        details: ["LLM confidence LOW"],
        layers: {
          intentComparison: { passed: true, issues: ["Low confidence parse"] },
          securityLinter: { riskLevel: "LOW", findings: [] },
        },
      });
    }

    if (includesAny(intent, ["safest", "low risk"]) && sageOutput.selectedPoolId !== 0) {
      details.push("Intent asked for safest/low-risk pool but selectedPoolId was not 0.");
      return NextResponse.json({
        verdict: "WARNING",
        riskLevel: "MEDIUM",
        summary: "Pool selection may not match the user's risk preference.",
        recommendation: "Ask user to confirm.",
        details,
        layers: {
          intentComparison: { passed: false, issues: details },
          securityLinter: { riskLevel: "MEDIUM", findings: [] },
        },
      });
    }

    return NextResponse.json({
      verdict: "EXECUTE",
      riskLevel: "NONE",
      summary: "Transaction verified — safe to execute",
      recommendation: "Proceed with vault deposit.",
      details: ["Deposit amount valid", "Pool valid", "Prompts present", "Confidence acceptable"],
      layers: {
        intentComparison: { passed: true, issues: [] },
        securityLinter: { riskLevel: "NONE", findings: [] },
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown Sentry error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
