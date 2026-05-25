// settle-sage/src/test.ts
// Quick test — run processIntent with mock context
// No wallet needed, no onchain calls — just Sage logic

import "dotenv/config";
import { processIntent } from "./sage";

async function main() {
  console.log("🌿 Testing Sage...\n");

  const output = await processIntent({
    intent: "deposit 500 USDC into the low risk pool",
    wallet: "0x15AB9D6d0B6E5B2736e70A8C2D0AE8D5B3C4F1E2",
    context: {
      balanceRaw: BigInt(1_200_000_000), // 1200 USDC
      pools: [
        { name: "SETTLE_POOL_A", apy: 5.2, apyBps: 520, risk: "LOW", index: 0 },
        {
          name: "SETTLE_POOL_B",
          apy: 8.71,
          apyBps: 871,
          risk: "MED",
          index: 1,
        },
        {
          name: "SETTLE_POOL_C",
          apy: 12.4,
          apyBps: 1240,
          risk: "HIGH",
          index: 2,
        },
      ],
      currentPosition: undefined,
    },
  });

  console.log("Action:     ", output.action);
  console.log("IntentText: ", output.intentText);
  console.log("AmountRaw:  ", output.amountRaw.toString());
  console.log("SlippageBps:", output.slippageBps);
  console.log("Calldata:   ", output.calldata);
  console.log("Reasoning:  ", output.reasoning);
  console.log("Confidence: ", output.confidence);
  console.log("Needs confirmation:", output.requiresConfirmation);
}

main().catch(console.error);
