import { useMemo } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import { contracts } from "@/lib/contracts";
import { apyFeedAbi } from "@/lib/abis/apyFeed";

export type UIPool = {
  id: number;
  name: string;
  apy: string;
  apyBps: bigint;
  risk: "LOW" | "MED" | "HIGH";
  active: boolean;
  lastUpdated: bigint;
};

function mapRisk(risk: string): "LOW" | "MED" | "HIGH" {
  const r = risk.toUpperCase();
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

function toNumberSafe(value: unknown): number {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function toStringSafe(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function normalizePool(raw: unknown, id: number): UIPool | null {
  if (!raw) return null;

  // viem can return tuple arrays or named tuple objects depending on ABI.
  if (Array.isArray(raw)) {
    const [name, apy, risk, active, lastUpdated] = raw;
    const apyBps = toBigIntSafe(apy);

    return {
      id,
      name: toStringSafe(name, `Pool ${id}`),
      apy: (Number(apyBps) / 100).toFixed(2),
      apyBps,
      risk: mapRisk(toStringSafe(risk, "HIGH")),
      active: Boolean(active),
      lastUpdated: toBigIntSafe(lastUpdated),
    };
  }

  const p = raw as {
    name?: unknown;
    apy?: unknown;
    risk?: unknown;
    active?: unknown;
    lastUpdated?: unknown;
  };

  const apyBps = toBigIntSafe(p.apy);

  return {
    id,
    name: toStringSafe(p.name, `Pool ${id}`),
    apy: (toNumberSafe(apyBps) / 100).toFixed(2),
    apyBps,
    risk: mapRisk(toStringSafe(p.risk, "HIGH")),
    active: Boolean(p.active),
    lastUpdated: toBigIntSafe(p.lastUpdated),
  };
}

export function usePools() {
  const countQuery = useReadContract({
    address: contracts.apyFeed,
    abi: apyFeedAbi,
    functionName: "poolCount",
    query: {
      refetchInterval: 10_000,
    },
  });

  const count = countQuery.data ? Number(countQuery.data) : 0;

  const poolQueries = useReadContracts({
    contracts: Array.from({ length: count }, (_, id) => ({
      address: contracts.apyFeed,
      abi: apyFeedAbi,
      functionName: "getPool",
      args: [BigInt(id)],
    })),
    query: {
      enabled: count > 0,
      refetchInterval: 10_000,
    },
  });

  const pools = useMemo<UIPool[]>(() => {
    if (!poolQueries.data) return [];

    return poolQueries.data
      .map((result, id) =>
        result.status === "success" ? normalizePool(result.result, id) : null,
      )
      .filter((pool): pool is UIPool => pool !== null);
  }, [poolQueries.data]);

  return {
    poolCount: count,
    pools,
    activePools: pools.filter((p) => p.active),
    isLoading: countQuery.isLoading || poolQueries.isLoading,
    error: countQuery.error || poolQueries.error,
    refetch: () => {
      countQuery.refetch();
      poolQueries.refetch();
    },
  };
}
