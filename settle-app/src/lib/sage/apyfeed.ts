// settle-app/src/lib/sage/apyfeed.ts
// Reads live pool data directly from APYFeed contract on Somnia.
// Deployed APYFeed.getPool(uint256) returns ONE Pool tuple/struct.

import { ethers } from "ethers";
import { Pool } from "./types";

const APYFEED_ABI = [
  "function poolCount() view returns (uint256)",
  "function getPool(uint256 poolId) view returns (tuple(string name,uint256 apy,string risk,bool active,uint256 lastUpdated))",
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

function toBigIntSafe(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isFinite(value)) {
    return BigInt(Math.trunc(value));
  }
  if (typeof value === "string" && value.trim() !== "") {
    return BigInt(value);
  }
  return BigInt(0);
}

type RawPool = {
  name: string;
  apy: bigint;
  risk: string;
  active: boolean;
  lastUpdated: bigint;
};

function normalizeRawPool(raw: unknown): RawPool {
  // Ethers v6 can return:
  // 1. a named Result: { name, apy, risk, active, lastUpdated }
  // 2. an array-like Result: [name, apy, risk, active, lastUpdated]
  // 3. rarely, a single nested tuple: [[name, apy, risk, active, lastUpdated]]
  const maybeArray = raw as Array<unknown>;

  if (Array.isArray(raw)) {
    const tuple =
      maybeArray.length === 1 && Array.isArray(maybeArray[0])
        ? (maybeArray[0] as Array<unknown>)
        : maybeArray;

    return {
      name: String(tuple[0] ?? ""),
      apy: toBigIntSafe(tuple[1]),
      risk: String(tuple[2] ?? "HIGH"),
      active: Boolean(tuple[3]),
      lastUpdated: toBigIntSafe(tuple[4]),
    };
  }

  const value = raw as Partial<RawPool>;

  return {
    name: String(value.name ?? ""),
    apy: toBigIntSafe(value.apy),
    risk: String(value.risk ?? "HIGH"),
    active: Boolean(value.active),
    lastUpdated: toBigIntSafe(value.lastUpdated),
  };
}

export async function fetchPools(): Promise<Pool[]> {
  const apyFeedAddress = process.env.APY_FEED_ADDRESS;
  if (!apyFeedAddress) throw new Error("APY_FEED_ADDRESS not set");

  const provider = getProvider();
  const apyFeed = new ethers.Contract(apyFeedAddress, APYFEED_ABI, provider);

  const poolCount: bigint = await apyFeed.poolCount();
  const count = Number(poolCount);

  if (count === 0) throw new Error("No pools found in APYFeed");

  const rawPools = await Promise.all(
    Array.from({ length: count }, (_, i) => apyFeed.getPool(i)),
  );

  return rawPools
    .map((raw, i) => {
      const p = normalizeRawPool(raw);

      return {
        name: p.name,
        apy: Number(p.apy) / 100, // 520 → 5.20
        apyBps: Number(p.apy), // raw basis points
        risk: mapRisk(p.risk),
        index: i,
        active: p.active,
      };
    })
    .filter((p) => p.active)
    .map(({ active: _active, ...p }) => p);
}

export function bestPool(pools: Pool[]): Pool {
  if (pools.length === 0) throw new Error("No pools available");
  return pools.reduce((best, p) => (p.apy > best.apy ? p : best), pools[0]);
}

export function bestPoolForRisk(
  pools: Pool[],
  maxRisk: "LOW" | "MED" | "HIGH",
): Pool {
  if (pools.length === 0) throw new Error("No pools available");

  const riskOrder = { LOW: 0, MED: 1, HIGH: 2 };
  const maxLevel = riskOrder[maxRisk];

  const eligible = pools.filter((p) => riskOrder[p.risk] <= maxLevel);

  return eligible.length > 0
    ? bestPool(eligible)
    : pools.reduce(
        (safest, p) =>
          riskOrder[p.risk] < riskOrder[safest.risk] ? p : safest,
        pools[0],
      );
}

export function safestPool(pools: Pool[]): Pool {
  if (pools.length === 0) throw new Error("No pools available");

  const riskOrder = { LOW: 0, MED: 1, HIGH: 2 };

  return pools.reduce((best, p) => {
    const pRisk = riskOrder[p.risk];
    const bestRisk = riskOrder[best.risk];

    if (pRisk < bestRisk) return p;
    if (pRisk === bestRisk && p.apy > best.apy) return p;

    return best;
  }, pools[0]);
}
