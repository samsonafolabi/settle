import { NextResponse } from "next/server";
import { createPublicClient, http, type Address, type PublicClient } from "viem";
import { z } from "zod";
import { somniaShannon } from "@/lib/chains";
import { contracts } from "@/lib/contracts";
import { erc20Abi } from "@/lib/abis/erc20";
import { vaultAbi } from "@/lib/abis/vault";
import { apyFeedAbi } from "@/lib/abis/apyFeed";
import { processIntent } from "@/lib/sage/sage";
import type { Pool, SageAction } from "@/lib/sage/types";

const Body = z.object({
  intent: z.string().min(1),
  wallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
});

type NormalizedPosition = {
  balance: bigint;
  depositTime: bigint;
  accruedInterest: bigint;
  lastClaimTime: bigint;
  poolId: number;
  poolAPY: bigint;
  active: boolean;
};

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

function normalizePosition(raw: unknown): NormalizedPosition {
  if (!raw) {
    return {
      balance: BigInt(0),
      depositTime: BigInt(0),
      accruedInterest: BigInt(0),
      lastClaimTime: BigInt(0),
      poolId: 0,
      poolAPY: BigInt(0),
      active: false,
    };
  }

  if (Array.isArray(raw)) {
    return {
      balance: toBigIntSafe(raw[0]),
      depositTime: toBigIntSafe(raw[1]),
      accruedInterest: toBigIntSafe(raw[2]),
      lastClaimTime: toBigIntSafe(raw[3]),
      poolId: Number(raw[4] ?? 0),
      poolAPY: toBigIntSafe(raw[5]),
      active: Boolean(raw[6]),
    };
  }

  const p = raw as {
    balance?: unknown;
    depositTime?: unknown;
    accruedInterest?: unknown;
    lastClaimTime?: unknown;
    poolId?: unknown;
    poolAPY?: unknown;
    active?: unknown;
  };

  return {
    balance: toBigIntSafe(p.balance),
    depositTime: toBigIntSafe(p.depositTime),
    accruedInterest: toBigIntSafe(p.accruedInterest),
    lastClaimTime: toBigIntSafe(p.lastClaimTime),
    poolId: Number(p.poolId ?? 0),
    poolAPY: toBigIntSafe(p.poolAPY),
    active: Boolean(p.active),
  };
}

function normalizeRisk(risk: unknown): "LOW" | "MED" | "HIGH" {
  const r = String(risk ?? "").toUpperCase();

  if (r === "LOW") return "LOW";
  if (r === "MED" || r === "MEDIUM") return "MED";

  return "HIGH";
}

function normalizePool(raw: unknown, index: number): Pool | null {
  if (!raw) return null;

  if (Array.isArray(raw)) {
    return {
      name: String(raw[0] ?? `SETTLE_POOL_${index}`),
      apy: Number(toBigIntSafe(raw[1])) / 100,
      apyBps: Number(toBigIntSafe(raw[1])),
      risk: normalizeRisk(raw[2]),
      index,
    };
  }

  const p = raw as {
    name?: unknown;
    apy?: unknown;
    risk?: unknown;
    active?: unknown;
    lastUpdated?: unknown;
  };

  if (p.active === false) return null;

  return {
    name: String(p.name ?? `SETTLE_POOL_${index}`),
    apy: Number(toBigIntSafe(p.apy)) / 100,
    apyBps: Number(toBigIntSafe(p.apy)),
    risk: normalizeRisk(p.risk),
    index,
  };
}

const FALLBACK_POOLS: Pool[] = [
  { name: "SETTLE_POOL_A", apy: 5.2, apyBps: 520, risk: "LOW", index: 0 },
  { name: "SETTLE_POOL_B", apy: 8.71, apyBps: 871, risk: "MED", index: 1 },
  { name: "SETTLE_POOL_C", apy: 12.4, apyBps: 1240, risk: "HIGH", index: 2 },
];

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function fetchPoolsWithViem(publicClient: PublicClient): Promise<Pool[]> {
  const countRaw = await publicClient.readContract({
    address: contracts.apyFeed,
    abi: apyFeedAbi,
    functionName: "poolCount",
  });

  const count = Number(countRaw);
  if (count <= 0) return FALLBACK_POOLS;

  const results = await Promise.all(
    Array.from({ length: count }, async (_, index) => {
      const raw = await publicClient.readContract({
        address: contracts.apyFeed,
        abi: apyFeedAbi,
        functionName: "getPool",
        args: [BigInt(index)],
      });

      return normalizePool(raw, index);
    }),
  );

  const pools = results.filter((pool): pool is Pool => pool !== null);

  return pools.length > 0 ? pools : FALLBACK_POOLS;
}

function serializeAction(action: SageAction) {
  if (action.type === "deposit" || action.type === "withdraw") {
    return { ...action, amountRaw: action.amountRaw.toString() };
  }

  return action;
}

export async function POST(req: Request) {
  try {
    const body = Body.parse(await req.json());
    const wallet = body.wallet as Address;

    const publicClient = createPublicClient({
      chain: somniaShannon,
      transport: http(
        process.env.SOMNIA_RPC_URL || "https://dream-rpc.somnia.network",
        {
          timeout: 15_000,
          retryCount: 2,
        },
      ),
    });

    const [balanceRaw, rawPosition, pools] = await Promise.all([
      withTimeout(
        publicClient.readContract({
          address: contracts.usdc,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [wallet],
        }),
        15_000,
        "USDC balance read",
      ),
      withTimeout(
        publicClient.readContract({
          address: contracts.vault,
          abi: vaultAbi,
          functionName: "positions",
          args: [wallet],
        }),
        15_000,
        "Vault position read",
      ),
      withTimeout(fetchPoolsWithViem(publicClient), 15_000, "APYFeed read").catch(
        (err) => {
          console.warn("APYFeed read failed — using fallback pools:", err);
          return FALLBACK_POOLS;
        },
      ),
    ]);

    const position = normalizePosition(rawPosition);

    const currentPosition = position.active
      ? {
          pool:
            pools.find((p) => p.index === position.poolId)?.name ??
            `Pool ${position.poolId}`,
          poolId: position.poolId,
          amountRaw: position.balance,
          apy: Number(position.poolAPY) / 100,
        }
      : undefined;

    const output = await processIntent({
      intent: body.intent,
      wallet,
      context: {
        balanceRaw,
        pools,
        currentPosition,
      },
    });

    return NextResponse.json({
      ...output,
      amountRaw: output.amountRaw.toString(),
      action: serializeAction(output.action),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown Sage error";
    console.error("/api/sage failed:", err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
