"use client";

import { useEffect, useMemo, useState } from "react";
import { usePublicClient, useReadContract } from "wagmi";
import { isAddress, parseAbiItem, type Address, type Hex } from "viem";
import { contracts } from "@/lib/contracts";
import { attestationStoreAbi } from "@/lib/abis/attestationStore";
import {
  analyzeReceiptPolicy,
  poolApyLabel,
  poolById,
  poolByName,
  poolRiskLabel,
  type PoolRisk,
} from "@/lib/receiptIntentPolicy";

const DEMO_WALLET = "0xD6D46424Fd4De1Aa5222772B6d251E645159d8fe" as Address;
const SHANNON_EXPLORER = "https://shannon-explorer.somnia.network";

const POLICY_RESOLVER_ACTIVATED_AT = Number(
  process.env.NEXT_PUBLIC_POLICY_RESOLVER_ACTIVATED_AT ?? "0",
);

const C = {
  bg: "#0F0F0F",
  surface: "#141414",
  surface2: "#1C1C1C",
  border: "#252525",
  borderSoft: "#1a1a1a",
  text: "#D9D9D9",
  textMuted: "#666",
  textDim: "#3A3A3A",
  white: "#fff",
  accent: "#3324FF",
  accent2: "#7B6FFF",
  green: "#00FF85",
  yellow: "#FFB800",
  red: "#FF6666",
};

const SANS = "'Syne', sans-serif";
const MONO = "'IBM Plex Mono', monospace";

type DepositReceipt = {
  wallet: Address;
  amount: bigint;
  poolId: number;
  poolName: string;
  intentText: string;
  timestamp: bigint;
  loggedAt: bigint;
};

type IndexedTx = {
  txHash: Hex;
  blockNumber?: bigint;
};

type TxIndexStatus = "idle" | "loading" | "ready" | "error";
type SortMode = "newest" | "oldest" | "mismatches";
type ReceiptStatus = "EXECUTED" | "WARNING" | "PRE-POLICY";

function shortAddress(address?: string) {
  if (!address) return "—";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function explorerTx(hash?: string) {
  if (!hash) return undefined;
  return `${SHANNON_EXPLORER}/tx/${hash}`;
}

function explorerAddress(address: string) {
  return `${SHANNON_EXPLORER}/address/${address}`;
}

function formatUsdc(raw: bigint) {
  const value = Number(raw) / 1_000_000;

  return value.toLocaleString(undefined, {
    maximumFractionDigits: 2,
  });
}

function timeAgo(timestamp: bigint) {
  const seconds = Number(timestamp);
  if (!seconds) return "—";

  const diff = Math.max(0, Math.floor(Date.now() / 1000) - seconds);

  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86_400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86_400)}d ago`;
}

function formatTimestamp(timestamp: bigint) {
  const seconds = Number(timestamp);
  if (!seconds) return "—";

  return new Date(seconds * 1000).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function riskTone(risk?: PoolRisk): "green" | "yellow" | "red" | "blue" {
  if (risk === "LOW") return "green";
  if (risk === "MED") return "yellow";
  if (risk === "HIGH") return "red";
  return "blue";
}

function statusTone(
  status: ReceiptStatus,
): "green" | "yellow" | "red" | "blue" {
  if (status === "EXECUTED") return "green";
  if (status === "PRE-POLICY") return "blue";
  return "yellow";
}

function toBigIntSafe(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isFinite(value)) {
    return BigInt(Math.trunc(value));
  }
  if (typeof value === "string" && value.trim() !== "") {
    return BigInt(value);
  }
  return 0n;
}

function normalizeReceipt(raw: unknown): DepositReceipt | null {
  if (!raw) return null;

  if (Array.isArray(raw)) {
    return {
      wallet: String(
        raw[0] ?? "0x0000000000000000000000000000000000000000",
      ) as Address,
      amount: toBigIntSafe(raw[1]),
      poolId: Number(raw[2] ?? 0),
      poolName: String(raw[3] ?? `Pool ${raw[2] ?? 0}`),
      intentText: String(raw[4] ?? ""),
      timestamp: toBigIntSafe(raw[5]),
      loggedAt: toBigIntSafe(raw[6]),
    };
  }

  const receipt = raw as {
    wallet?: unknown;
    amount?: unknown;
    poolId?: unknown;
    poolName?: unknown;
    intentText?: unknown;
    timestamp?: unknown;
    loggedAt?: unknown;
  };

  return {
    wallet: String(
      receipt.wallet ?? "0x0000000000000000000000000000000000000000",
    ) as Address,
    amount: toBigIntSafe(receipt.amount),
    poolId: Number(receipt.poolId ?? 0),
    poolName: String(receipt.poolName ?? `Pool ${receipt.poolId ?? 0}`),
    intentText: String(receipt.intentText ?? ""),
    timestamp: toBigIntSafe(receipt.timestamp),
    loggedAt: toBigIntSafe(receipt.loggedAt),
  };
}

function receiptKey(receipt: DepositReceipt) {
  const pool = poolById(receipt.poolId) ?? poolByName(receipt.poolName);
  const poolName = pool?.name ?? receipt.poolName;

  return [
    receipt.wallet.toLowerCase(),
    receipt.amount.toString(),
    poolName,
    receipt.timestamp.toString(),
  ].join(":");
}

function eventKey(args: {
  wallet: Address;
  amount: bigint;
  poolName: string;
  timestamp: bigint;
}) {
  return [
    args.wallet.toLowerCase(),
    args.amount.toString(),
    args.poolName,
    args.timestamp.toString(),
  ].join(":");
}

function isPrePolicy(receipt: DepositReceipt) {
  return (
    POLICY_RESOLVER_ACTIVATED_AT > 0 &&
    Number(receipt.timestamp) < POLICY_RESOLVER_ACTIVATED_AT
  );
}

function receiptStatus(receipt: DepositReceipt): {
  status: ReceiptStatus;
  mismatch: boolean;
  expectedPoolName?: string;
  expectedReason?: string;
} {
  const analysis = analyzeReceiptPolicy(
    receipt.intentText,
    receipt.poolId,
    receipt.poolName,
  );

  if (isPrePolicy(receipt)) {
    return {
      status: "PRE-POLICY",
      mismatch: analysis.mismatch,
      expectedPoolName: analysis.expectedPool?.name,
      expectedReason: analysis.expectedReason,
    };
  }

  return {
    status: analysis.mismatch ? "WARNING" : "EXECUTED",
    mismatch: analysis.mismatch,
    expectedPoolName: analysis.expectedPool?.name,
    expectedReason: analysis.expectedReason,
  };
}

function Pill({
  children,
  tone = "blue",
}: {
  children: React.ReactNode;
  tone?: "green" | "yellow" | "red" | "blue" | "gray";
}) {
  const map = {
    green: {
      background: `${C.green}14`,
      color: C.green,
      border: `1px solid ${C.green}30`,
    },
    yellow: {
      background: `${C.yellow}14`,
      color: C.yellow,
      border: `1px solid ${C.yellow}30`,
    },
    red: {
      background: "#FF444414",
      color: C.red,
      border: "1px solid #FF444430",
    },
    blue: {
      background: `${C.accent}18`,
      color: C.accent2,
      border: `1px solid ${C.accent}44`,
    },
    gray: {
      background: "#25252566",
      color: "#888",
      border: "1px solid #383838",
    },
  } as const;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 7px",
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: "0.05em",
        borderRadius: 2,
        whiteSpace: "nowrap",
        ...map[tone],
      }}
    >
      {children}
    </span>
  );
}

function Dot({ tone = "green" }: { tone?: "green" | "blue" | "yellow" }) {
  const color =
    tone === "green" ? C.green : tone === "yellow" ? C.yellow : C.accent2;

  return (
    <span
      style={{
        width: 6,
        height: 6,
        borderRadius: "50%",
        display: "inline-block",
        flexShrink: 0,
        background: color,
        boxShadow: tone === "green" ? `0 0 5px ${C.green}66` : undefined,
      }}
    />
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "green" | "default";
}) {
  return (
    <div style={{ textAlign: "right" }}>
      <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 2 }}>
        {label}
      </div>
      <div
        style={{
          fontFamily: MONO,
          fontSize: 14,
          fontWeight: 600,
          color: tone === "green" ? C.green : C.text,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function SortButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: active ? C.accent : "transparent",
        border: `1px solid ${active ? C.accent : C.border}`,
        padding: "7px 10px",
        fontFamily: SANS,
        fontSize: 11,
        color: active ? C.white : C.textMuted,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function TimelineNote() {
  return (
    <section
      style={{
        padding: "12px 28px",
        borderBottom: `1px solid ${C.borderSoft}`,
        background: "#101010",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          border: `1px solid ${C.border}`,
          borderLeft: `2px solid ${C.accent}`,
          background: C.surface,
          padding: "12px 14px",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 14,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 10,
              color: C.textMuted,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              marginBottom: 4,
            }}
          >
            Policy timeline
          </div>

          <div style={{ fontSize: 12, color: C.text, lineHeight: 1.5 }}>
            Older receipts can include pre-policy behavior from before Settle’s
            deterministic policy resolver was enforced. Newer receipts reflect
            the live policy layer: explicit pool requests are hard-locked, while
            strategy requests are resolved by policy.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 6,
            flexWrap: "wrap",
            justifyContent: "flex-end",
          }}
        >
          <Pill tone="blue">PRE-POLICY</Pill>
          <Pill tone="green">EXECUTED</Pill>
          <Pill tone="yellow">WARNING</Pill>
        </div>
      </div>
    </section>
  );
}

function ReceiptRow({
  receipt,
  active,
  txHash,
  onClick,
}: {
  receipt: DepositReceipt;
  active: boolean;
  txHash?: Hex;
  onClick: () => void;
}) {
  const pool = poolById(receipt.poolId) ?? poolByName(receipt.poolName);
  const poolName = pool?.name ?? receipt.poolName;
  const risk = poolRiskLabel(receipt.poolId, receipt.poolName);
  const { status, mismatch } = receiptStatus(receipt);

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: "100%",
        textAlign: "left",
        padding: "14px 20px",
        border: "none",
        borderBottom: `1px solid ${C.borderSoft}`,
        borderLeft: active ? `2px solid ${C.accent}` : "2px solid transparent",
        background: active ? C.surface : "transparent",
        cursor: "pointer",
        fontFamily: SANS,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 10,
          marginBottom: 6,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            minWidth: 0,
            flexWrap: "wrap",
          }}
        >
          <Dot
            tone={
              status === "WARNING"
                ? "yellow"
                : status === "PRE-POLICY"
                  ? "blue"
                  : "green"
            }
          />
          <span
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: active ? C.white : C.text,
              whiteSpace: "nowrap",
            }}
          >
            Deposit receipt
          </span>
          <Pill tone={statusTone(status)}>{status}</Pill>
          {mismatch && status !== "WARNING" && (
            <Pill tone="yellow">MISMATCH</Pill>
          )}
          {txHash && <Pill tone="green">TX</Pill>}
        </div>

        <span
          style={{
            fontFamily: MONO,
            fontSize: 13,
            fontWeight: 600,
            color: C.green,
            whiteSpace: "nowrap",
          }}
        >
          +{formatUsdc(receipt.amount)} USDC
        </span>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 10,
          paddingLeft: 13,
        }}
      >
        <span
          style={{
            fontSize: 11,
            color: C.textMuted,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {poolName} · {poolApyLabel(receipt.poolId, receipt.poolName)} APY ·{" "}
          {risk} risk
        </span>

        <span
          style={{
            fontFamily: MONO,
            fontSize: 10,
            color: C.textDim,
            whiteSpace: "nowrap",
          }}
        >
          {timeAgo(receipt.timestamp)}
        </span>
      </div>

      {receipt.intentText && (
        <div style={{ paddingLeft: 13, marginTop: 4 }}>
          <span
            style={{
              fontSize: 11,
              color: "#444",
              fontStyle: "italic",
              display: "block",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            &quot;{receipt.intentText}&quot;
          </span>
        </div>
      )}
    </button>
  );
}

function Detail({
  receipt,
  txHash,
}: {
  receipt: DepositReceipt | null;
  txHash?: Hex;
}) {
  if (!receipt) {
    return (
      <div
        style={{
          flex: 1,
          background: C.surface,
          borderLeft: `1px solid ${C.border}`,
          padding: 24,
        }}
      >
        <div style={{ fontFamily: SANS, fontSize: 13, color: C.textMuted }}>
          Select a receipt.
        </div>
      </div>
    );
  }

  const pool = poolById(receipt.poolId) ?? poolByName(receipt.poolName);
  const poolName = pool?.name ?? receipt.poolName;
  const risk = poolRiskLabel(receipt.poolId, receipt.poolName);
  const apy = poolApyLabel(receipt.poolId, receipt.poolName);
  const txUrl = explorerTx(txHash);
  const { status, mismatch, expectedPoolName, expectedReason } =
    receiptStatus(receipt);

  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        overflowY: "auto",
        padding: "20px 24px",
        background: C.surface,
        borderLeft: `1px solid ${C.border}`,
      }}
    >
      <div style={{ marginBottom: 20 }}>
        <div
          style={{
            fontSize: 10,
            color: C.textMuted,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            marginBottom: 6,
          }}
        >
          Onchain Receipt
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 16,
          }}
        >
          <div>
            <div
              style={{
                fontFamily: MONO,
                fontSize: 24,
                fontWeight: 700,
                color: C.white,
                letterSpacing: "-0.02em",
              }}
            >
              +{formatUsdc(receipt.amount)} USDC
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginTop: 5,
              }}
            >
              <Dot
                tone={
                  status === "WARNING"
                    ? "yellow"
                    : status === "PRE-POLICY"
                      ? "blue"
                      : "green"
                }
              />
              <span
                style={{
                  fontSize: 11,
                  color:
                    status === "WARNING"
                      ? C.yellow
                      : status === "PRE-POLICY"
                        ? C.accent2
                        : C.green,
                }}
              >
                {status}
              </span>
              <span style={{ color: "#383838" }}>·</span>
              <span
                style={{ fontFamily: MONO, fontSize: 11, color: C.textMuted }}
              >
                {timeAgo(receipt.timestamp)} ·{" "}
                {formatTimestamp(receipt.timestamp)}
              </span>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              gap: 6,
              flexWrap: "wrap",
              justifyContent: "flex-end",
            }}
          >
            <Pill tone={statusTone(status)}>{status}</Pill>
            <Pill tone={riskTone(risk)}>{risk} RISK</Pill>
          </div>
        </div>
      </div>

      {status === "PRE-POLICY" && (
        <div
          style={{
            background: `${C.accent}10`,
            border: `1px solid ${C.accent}44`,
            padding: "10px 12px",
            marginBottom: 16,
            fontSize: 12,
            color: C.accent2,
            lineHeight: 1.5,
          }}
        >
          This receipt was recorded before the current policy resolver was
          enforced. It is shown as part of Settle’s public build timeline.
        </div>
      )}

      {status === "WARNING" && (
        <div
          style={{
            background: `${C.yellow}10`,
            border: `1px solid ${C.yellow}44`,
            padding: "10px 12px",
            marginBottom: 16,
            fontSize: 12,
            color: C.yellow,
            lineHeight: 1.5,
          }}
        >
          Current-policy warning: the finalised pool appears to differ from the
          resolved user policy.
        </div>
      )}

      <div
        style={{
          background: C.surface2,
          border: `1px solid ${C.border}`,
          borderLeft: `2px solid ${C.accent}`,
          padding: "10px 12px",
          marginBottom: 16,
          fontSize: 12,
          color: "#888",
          fontStyle: "italic",
        }}
      >
        &quot;{receipt.intentText || "No intent text recorded"}&quot;
      </div>

      {(expectedPoolName || expectedReason || mismatch) && (
        <div
          style={{
            background: "#101010",
            border: `1px solid ${C.border}`,
            padding: 12,
            marginBottom: 16,
          }}
        >
          <div
            style={{
              fontSize: 10,
              color: C.textMuted,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              marginBottom: 8,
            }}
          >
            Policy read
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            {expectedPoolName && (
              <div style={{ fontSize: 12, color: C.textMuted }}>
                Expected pool:{" "}
                <span style={{ color: C.text }}>{expectedPoolName}</span>
              </div>
            )}

            <div style={{ fontSize: 12, color: C.textMuted }}>
              Final pool: <span style={{ color: C.text }}>{poolName}</span>
            </div>

            {expectedReason && (
              <div
                style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.5 }}
              >
                {expectedReason}
              </div>
            )}
          </div>
        </div>
      )}

      <div
        style={{
          background: C.surface2,
          border: `1px solid ${C.border}`,
          padding: 14,
          marginBottom: 16,
        }}
      >
        <div
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}
        >
          <div>
            <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 3 }}>
              Wallet
            </div>
            <a
              href={explorerAddress(receipt.wallet)}
              target="_blank"
              rel="noreferrer"
              style={{
                fontFamily: MONO,
                fontSize: 11,
                color: C.accent2,
                fontWeight: 500,
              }}
            >
              {shortAddress(receipt.wallet)} ↗
            </a>
          </div>

          <div>
            <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 3 }}>
              Pool
            </div>
            <div style={{ fontSize: 12, color: C.text, fontWeight: 500 }}>
              {poolName}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 3 }}>
              APY at receipt
            </div>
            <div style={{ fontSize: 12, color: C.green, fontWeight: 500 }}>
              {apy}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 3 }}>
              Risk
            </div>
            <Pill tone={riskTone(risk)}>{risk}</Pill>
          </div>

          <div>
            <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 3 }}>
              Vault tx
            </div>
            {txUrl ? (
              <a
                href={txUrl}
                target="_blank"
                rel="noreferrer"
                style={{
                  fontFamily: MONO,
                  fontSize: 11,
                  color: C.accent2,
                  fontWeight: 500,
                }}
              >
                {shortAddress(txHash)} ↗
              </a>
            ) : (
              <div style={{ fontSize: 11, color: C.textMuted }}>
                Event tx not indexed yet
              </div>
            )}
          </div>

          <div>
            <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 3 }}>
              AttestationStore
            </div>
            <Pill tone="green">RECORDED</Pill>
          </div>
        </div>
      </div>

      <div
        style={{
          border: `1px solid ${C.border}`,
          padding: 12,
          marginBottom: 16,
          background: "#101010",
        }}
      >
        <div
          style={{
            fontSize: 10,
            color: C.textMuted,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            marginBottom: 8,
          }}
        >
          Public proof
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          <a
            href={explorerAddress(contracts.attestationStore)}
            target="_blank"
            rel="noreferrer"
            style={{ fontFamily: MONO, fontSize: 11, color: C.accent2 }}
          >
            AttestationStore {shortAddress(contracts.attestationStore)} ↗
          </a>

          <a
            href={explorerAddress(contracts.vault)}
            target="_blank"
            rel="noreferrer"
            style={{ fontFamily: MONO, fontSize: 11, color: C.accent2 }}
          >
            SettleVault {shortAddress(contracts.vault)} ↗
          </a>

          <div style={{ fontSize: 11, color: C.textMuted, lineHeight: 1.5 }}>
            Receipt data is read from{" "}
            <span style={{ color: C.text }}>
              AttestationStore.getDeposits(wallet)
            </span>
            . Vault transaction hashes are attached from event logs when
            available.
          </div>
        </div>
      </div>

      <div
        style={{
          marginTop: 12,
          paddingTop: 12,
          borderTop: `1px solid ${C.borderSoft}`,
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <span
          style={{
            fontFamily: MONO,
            fontSize: 10,
            color: C.textDim,
            letterSpacing: "0.05em",
          }}
        >
          SETTLE · SOMNIA
        </span>
        <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>
          PUBLIC RECEIPT BROWSER
        </span>
      </div>
    </div>
  );
}

export function PublicReceiptBrowser() {
  const publicClient = usePublicClient();
  const [walletInput, setWalletInput] = useState(DEMO_WALLET);
  const [targetWallet, setTargetWallet] = useState<Address>(DEMO_WALLET);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [sortMode, setSortMode] = useState<SortMode>("oldest");
  const [txIndex, setTxIndex] = useState<Record<string, IndexedTx>>({});
  const [txStatus, setTxStatus] = useState<TxIndexStatus>("idle");
  const [txIndexNote, setTxIndexNote] = useState<string>("");

  const deposits = useReadContract({
    address: contracts.attestationStore,
    abi: attestationStoreAbi,
    functionName: "getDeposits",
    args: [targetWallet],
    query: {
      enabled: Boolean(targetWallet),
      refetchInterval: 15_000,
    },
  });

  const rawReceipts = useMemo(() => {
    const data = deposits.data ?? [];

    return data
      .map(normalizeReceipt)
      .filter((receipt): receipt is DepositReceipt => Boolean(receipt));
  }, [deposits.data]);

  const receipts = useMemo(() => {
    const next = [...rawReceipts];

    if (sortMode === "oldest") {
      return next.sort((a, b) => Number(a.timestamp - b.timestamp));
    }

    if (sortMode === "mismatches") {
      return next
        .filter((receipt) => {
          const status = receiptStatus(receipt);
          return (
            status.status === "PRE-POLICY" ||
            status.status === "WARNING" ||
            status.mismatch
          );
        })
        .sort((a, b) => Number(a.timestamp - b.timestamp));
    }

    return next.sort((a, b) => Number(b.timestamp - a.timestamp));
  }, [rawReceipts, sortMode]);

  const statusCounts = useMemo(() => {
    return rawReceipts.reduce(
      (acc, receipt) => {
        const status = receiptStatus(receipt).status;
        acc[status] += 1;
        return acc;
      },
      {
        EXECUTED: 0,
        WARNING: 0,
        "PRE-POLICY": 0,
      } as Record<ReceiptStatus, number>,
    );
  }, [rawReceipts]);

  const totalDeposited = useMemo(() => {
    return rawReceipts.reduce(
      (sum, receipt) => sum + Number(receipt.amount) / 1_000_000,
      0,
    );
  }, [rawReceipts]);

  const selected = receipts[selectedIndex] ?? null;
  const selectedTx = selected
    ? txIndex[receiptKey(selected)]?.txHash
    : undefined;

  useEffect(() => {
    setSelectedIndex(0);
  }, [targetWallet, sortMode]);

  useEffect(() => {
    let cancelled = false;

    async function indexVaultDepositEvents() {
      if (!publicClient || !targetWallet || rawReceipts.length === 0) {
        console.log("early return:", {
          publicClient: !!publicClient,
          targetWallet,
          rawReceiptsLength: rawReceipts.length,
        });
        setTxIndex({});
        setTxStatus("idle");
        return;
      }

      setTxStatus("loading");
      setTxIndexNote("");

      try {
        const depositFinalisedEvent = parseAbiItem(
          "event DepositFinalised(bytes32 indexed depositId,address indexed wallet,uint256 amount,uint8 poolId,uint256 apy)",
        );

        const fromBlockEnv = process.env.NEXT_PUBLIC_VAULT_DEPLOY_BLOCK;
        const latestBlock = await publicClient.getBlockNumber();
        const client = publicClient;

        const FALLBACK_LOOKBACK = 25_000n;
        const fromBlock =
          fromBlockEnv && /^\d+$/.test(fromBlockEnv)
            ? BigInt(fromBlockEnv)
            : latestBlock > FALLBACK_LOOKBACK
              ? latestBlock - FALLBACK_LOOKBACK
              : 0n;

        const startBlock = fromBlock > latestBlock ? latestBlock : fromBlock;

        const maxRange = 999n;
        const logs: any[] = [];

        for (
          let chunkStart = startBlock;
          chunkStart <= latestBlock;
          chunkStart += maxRange + 1n
        ) {
          const chunkEnd =
            chunkStart + maxRange > latestBlock
              ? latestBlock
              : chunkStart + maxRange;

          const chunkLogs = await client.getLogs({
            address: contracts.vault,
            event: depositFinalisedEvent,
            args: { wallet: targetWallet },
            fromBlock: chunkStart,
            toBlock: chunkEnd,
          } as any);

          logs.push(...(chunkLogs as any[]));

          if (cancelled) return;
        }

        if (cancelled) return;

        console.log("DepositFinalised logs found:", logs.length, logs);
        console.log("rawReceipts:", rawReceipts.length, rawReceipts);
        console.log("targetWallet:", targetWallet);
        console.log(
          "startBlock:",
          startBlock.toString(),
          "latestBlock:",
          latestBlock.toString(),
        );

        // Fetch block timestamps for all unique blocks in parallel
        const uniqueBlocks = [
          ...new Set(logs.map((l: any) => l.blockNumber as bigint)),
        ];
        const blockTimestamps = new Map<bigint, bigint>();
        await Promise.all(
          uniqueBlocks.map(async (blockNumber) => {
            try {
              const block = await client.getBlock({ blockNumber });
              blockTimestamps.set(blockNumber, block.timestamp);
            } catch {
              // ignore; receipt won't match
            }
          }),
        );

        if (cancelled) return;

        // Build candidates keyed by wallet+amount+poolId
        type Candidate = {
          txHash: Hex;
          blockNumber: bigint;
          blockTimestamp: bigint;
        };
        const candidates = new Map<string, Candidate[]>();

        for (const log of logs as any[]) {
          const args = log.args ?? {};
          const wallet = String(args.wallet ?? targetWallet).toLowerCase();
          const amount = toBigIntSafe(args.amount);
          const poolId = Number(args.poolId ?? 0);
          const txHash = log.transactionHash as Hex | undefined;
          const blockNumber = log.blockNumber as bigint | undefined;

          if (!txHash || amount === 0n || blockNumber === undefined) continue;

          const blockTimestamp = blockTimestamps.get(blockNumber) ?? 0n;
          const looseKey = [wallet, amount.toString(), poolId].join(":");
          const bucket = candidates.get(looseKey) ?? [];
          bucket.push({ txHash, blockNumber, blockTimestamp });
          candidates.set(looseKey, bucket);
        }

        const TOLERANCE = 120n;
        const index: Record<string, IndexedTx> = {};

        for (const receipt of rawReceipts) {
          const pool = poolById(receipt.poolId) ?? poolByName(receipt.poolName);
          const poolName = pool?.name ?? receipt.poolName;
          const looseKey = [
            receipt.wallet.toLowerCase(),
            receipt.amount.toString(),
            receipt.poolId,
          ].join(":");
          const bucket = candidates.get(looseKey);
          if (!bucket) continue;

          const match =
            bucket.find((c) => {
              const diffA =
                c.blockTimestamp >= receipt.timestamp
                  ? c.blockTimestamp - receipt.timestamp
                  : receipt.timestamp - c.blockTimestamp;
              const diffB =
                c.blockTimestamp >= receipt.loggedAt
                  ? c.blockTimestamp - receipt.loggedAt
                  : receipt.loggedAt - c.blockTimestamp;
              return diffA <= TOLERANCE || diffB <= TOLERANCE;
            }) ?? bucket[0];

          if (match) {
            index[
              eventKey({
                wallet: receipt.wallet,
                amount: receipt.amount,
                poolName,
                timestamp: receipt.timestamp,
              })
            ] = {
              txHash: match.txHash,
              blockNumber: match.blockNumber,
            };
          }
        }

        setTxIndex(index);
        setTxStatus("ready");
        setTxIndexNote(
          logs.length > 0
            ? `Indexed ${logs.length} vault deposit event${logs.length === 1 ? "" : "s"}.`
            : "No matching vault deposit events found for this wallet yet.",
        );
      } catch (error) {
        if (cancelled) return;

        setTxIndex({});
        setTxStatus("error");
        setTxIndexNote(
          error instanceof Error
            ? error.message
            : "Could not index vault events from RPC.",
        );
      }
    }

    indexVaultDepositEvents();

    return () => {
      cancelled = true;
    };
  }, [publicClient, targetWallet, rawReceipts.length]);

  function submitWallet(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const next = walletInput.trim();

    if (!isAddress(next)) {
      alert("Enter a valid EVM wallet address.");
      return;
    }

    setTargetWallet(next as Address);
  }

  function resetDemoWallet() {
    setWalletInput(DEMO_WALLET);
    setTargetWallet(DEMO_WALLET);
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: C.bg,
        color: C.text,
        fontFamily: SANS,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Syne:wght@400;500;600;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; }
        body { margin: 0; background: ${C.bg}; }
        input::placeholder { color: ${C.textDim}; }
        button { transition: opacity 0.12s; }
        button:hover:not(:disabled) { opacity: 0.82; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 2px; }
      `}</style>

      <div style={{ height: 3, background: C.accent, flexShrink: 0 }} />

      <section
        style={{
          padding: "22px 28px 18px",
          borderBottom: `1px solid ${C.border}`,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 24,
          flexShrink: 0,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 10,
              color: C.textMuted,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              marginBottom: 6,
            }}
          >
            Settle Receipts
          </div>

          <h1
            style={{
              margin: 0,
              fontSize: 28,
              fontWeight: 700,
              color: C.white,
              letterSpacing: "-0.04em",
            }}
          >
            Public onchain receipt timeline
          </h1>

          <p
            style={{
              margin: "8px 0 0",
              maxWidth: 700,
              fontSize: 13,
              lineHeight: 1.6,
              color: C.textMuted,
            }}
          >
            Browse agent-managed deposit receipts recorded in AttestationStore
            on Somnia. The oldest-first view shows Settle’s evolution from
            pre-policy receipts to the current resolver-backed flow.
          </p>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
            justifyContent: "flex-end",
          }}
        >
          <Pill tone="green">PUBLIC READ</Pill>
          <Pill tone="blue">SOMNIA TESTNET</Pill>
          <a
            href={explorerAddress(contracts.attestationStore)}
            target="_blank"
            rel="noreferrer"
            style={{
              background: C.surface,
              border: `1px solid ${C.border}`,
              padding: "6px 10px",
              fontSize: 10,
              color: C.accent2,
              fontFamily: MONO,
              textDecoration: "none",
            }}
          >
            AttestationStore ↗
          </a>
        </div>
      </section>

      <section
        style={{
          padding: "14px 28px",
          borderBottom: `1px solid ${C.borderSoft}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 18,
          flexShrink: 0,
        }}
      >
        <form
          onSubmit={submitWallet}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            minWidth: 0,
            flex: 1,
          }}
        >
          <input
            value={walletInput}
            onChange={(event) => setWalletInput(event.target.value as Address)}
            placeholder="Paste wallet address"
            style={{
              width: "min(560px, 100%)",
              minWidth: 0,
              background: C.surface2,
              border: `1px solid ${C.border}`,
              color: C.text,
              padding: "10px 12px",
              outline: "none",
              fontFamily: MONO,
              fontSize: 12,
            }}
          />

          <button
            type="submit"
            style={{
              background: C.accent,
              border: "none",
              color: C.white,
              fontFamily: SANS,
              fontSize: 12,
              fontWeight: 600,
              padding: "10px 14px",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            Load receipts
          </button>

          <button
            type="button"
            onClick={resetDemoWallet}
            style={{
              background: "transparent",
              border: `1px solid ${C.border}`,
              color: C.textMuted,
              fontFamily: SANS,
              fontSize: 12,
              padding: "9px 12px",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            Demo wallet
          </button>
        </form>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, auto)",
            gap: 18,
          }}
        >
          <Stat
            label="Deposited"
            value={`$${totalDeposited.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
            tone="green"
          />
          <Stat
            label="Receipts"
            value={deposits.isLoading ? "…" : String(rawReceipts.length)}
          />
          <Stat label="Pre-policy" value={String(statusCounts["PRE-POLICY"])} />
          <Stat label="Warnings" value={String(statusCounts.WARNING)} />
        </div>
      </section>

      <TimelineNote />

      <section
        style={{
          padding: "10px 28px",
          borderBottom: `1px solid ${C.borderSoft}`,
          background: "#101010",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 14,
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <Dot tone={txStatus === "error" ? "yellow" : "green"} />
            <span
              style={{ fontFamily: MONO, fontSize: 11, color: C.textMuted }}
            >
              Viewing wallet:
            </span>
            <a
              href={explorerAddress(targetWallet)}
              target="_blank"
              rel="noreferrer"
              style={{ fontFamily: MONO, fontSize: 11, color: C.accent2 }}
            >
              {targetWallet} ↗
            </a>
            {txIndexNote && (
              <>
                <span style={{ color: C.textDim }}>·</span>
                <span
                  style={{
                    fontSize: 11,
                    color: txStatus === "error" ? C.yellow : C.textMuted,
                  }}
                >
                  {txIndexNote}
                </span>
              </>
            )}
          </div>

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <SortButton
              active={sortMode === "oldest"}
              onClick={() => setSortMode("oldest")}
            >
              Oldest first
            </SortButton>
            <SortButton
              active={sortMode === "newest"}
              onClick={() => setSortMode("newest")}
            >
              Newest first
            </SortButton>
            <SortButton
              active={sortMode === "mismatches"}
              onClick={() => setSortMode("mismatches")}
            >
              Mismatches
            </SortButton>
          </div>
        </div>
      </section>

      <section style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <div
          style={{
            width: 410,
            flexShrink: 0,
            overflowY: "auto",
            borderRight: `1px solid ${C.border}`,
          }}
        >
          {deposits.error && (
            <div style={{ padding: 16, color: C.red, fontSize: 12 }}>
              Failed to load receipts: {deposits.error.message}
            </div>
          )}

          {deposits.isLoading && (
            <div style={{ padding: 16, color: C.textMuted, fontSize: 12 }}>
              Loading onchain receipts...
            </div>
          )}

          {!deposits.isLoading && receipts.length === 0 && (
            <div style={{ padding: 16, color: C.textMuted, fontSize: 12 }}>
              No receipts found for this view.
            </div>
          )}

          {receipts.map((receipt, index) => (
            <ReceiptRow
              key={`${receiptKey(receipt)}:${index}`}
              receipt={receipt}
              txHash={txIndex[receiptKey(receipt)]?.txHash}
              active={index === selectedIndex}
              onClick={() => setSelectedIndex(index)}
            />
          ))}
        </div>

        <Detail receipt={selected} txHash={selectedTx} />
      </section>
    </main>
  );
}
