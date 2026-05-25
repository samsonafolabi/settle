// settle-sage/src/apyfeed.ts
// Reads live pool data directly from APYFeed contract on Somnia
// Single source of truth — no hardcoding

import { ethers } from "ethers";
import { Pool } from "./types";

const APYFEED_ABI = [
  "function poolCount() external view returns (uint256)",
  "function getPool(uint256 poolId) external view returns (string name, uint256 apy, string risk, bool active, uint256 lastUpdated)",
];

function getProvider(): ethers.JsonRpcProvider {
  const rpcUrl = process.env.SOMNIA_RPC_URL;
  if (!rpcUrl) throw new Error("SOMNIA_RPC_URL not set");
  return new ethers.JsonRpcProvider(rpcUrl);
}

function mapRisk(raw: string): "LOW" | "MED" | "HIGH" {
  const r = raw.toUpperCase();
  if (r === "LOW") return "LOW";
  if (r === "MED" || r === "MEDIUM") return "MED";
  return "HIGH";
}

export async function fetchPools(): Promise<Pool[]> {
  const apyFeedAddress = process.env.APY_FEED_ADDRESS;
  if (!apyFeedAddress) throw new Error("APY_FEED_ADDRESS not set");

  const provider = getProvider();
  const apyFeed = new ethers.Contract(apyFeedAddress, APYFEED_ABI, provider);

  const poolCount: bigint = await apyFeed.poolCount();
  const count = Number(poolCount);
  if (count === 0) throw new Error("No pools found in APYFeed");

  // Fetch all pools in parallel
  const rawPools = await Promise.all(
    Array.from({ length: count }, (_, i) => apyFeed.getPool(i)),
  );

  return rawPools
    .map((p, i) => ({
      name: p.name,
      apy: Number(p.apy) / 100, // 520 → 5.20
      apyBps: Number(p.apy), // raw basis points
      risk: mapRisk(p.risk),
      index: i,
    }))
    .filter((_, i) => rawPools[i].active);
}

export function bestPool(pools: Pool[]): Pool {
  return pools.reduce((best, p) => (p.apy > best.apy ? p : best), pools[0]);
}

export function bestPoolForRisk(
  pools: Pool[],
  maxRisk: "LOW" | "MED" | "HIGH",
): Pool {
  const riskOrder = { LOW: 0, MED: 1, HIGH: 2 };
  const maxLevel = riskOrder[maxRisk];

  const eligible = pools.filter((p) => riskOrder[p.risk] <= maxLevel);

  // Fallback to lowest risk if nothing eligible
  return eligible.length > 0
    ? bestPool(eligible)
    : pools.reduce(
        (safest, p) =>
          riskOrder[p.risk] < riskOrder[safest.risk] ? p : safest,
        pools[0],
      );
}
