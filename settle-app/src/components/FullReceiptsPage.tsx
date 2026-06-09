"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { useReceiptHistory } from "@/hooks/useReceiptHistory";
import type { ReceiptCardData } from "@/components/ReceiptCard";
import { TxHashLink } from "@/components/TxHashLink";

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

type Filter = "all" | "deposit" | "rebalance";

function shortAddress(address?: string) {
  if (!address) return "Not connected";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function cleanAmount(amountLabel: string) {
  return amountLabel.replace(" USDC", "");
}

function riskTone(risk?: string): "green" | "yellow" | "red" | "blue" {
  if (risk === "LOW") return "green";
  if (risk === "MED") return "yellow";
  if (risk === "HIGH") return "red";
  return "blue";
}

function Pill({
  children,
  tone = "blue",
}: {
  children: React.ReactNode;
  tone?: "green" | "yellow" | "red" | "blue" | "gray";
}) {
  const map = {
    green: { background: `${C.green}14`, color: C.green, border: `1px solid ${C.green}30` },
    yellow: { background: `${C.yellow}14`, color: C.yellow, border: `1px solid ${C.yellow}30` },
    red: { background: "#FF444414", color: C.red, border: "1px solid #FF444430" },
    blue: { background: `${C.accent}18`, color: C.accent2, border: `1px solid ${C.accent}44` },
    gray: { background: "#25252566", color: "#888", border: "1px solid #383838" },
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
        ...map[tone],
      }}
    >
      {children}
    </span>
  );
}

function Dot({ tone = "green" }: { tone?: "green" | "blue" | "yellow" }) {
  const color = tone === "green" ? C.green : tone === "yellow" ? C.yellow : C.accent2;

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

function Check() {
  return (
    <div
      style={{
        width: 18,
        height: 18,
        borderRadius: "50%",
        background: `${C.green}20`,
        border: `1px solid ${C.green}44`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
        <path
          d="M1.5 4.5l2 2 4-4"
          stroke={C.green}
          strokeWidth="1.4"
          strokeLinecap="square"
        />
      </svg>
    </div>
  );
}

function FilterButton({
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
        padding: "6px 12px",
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

function ReceiptRow({
  receipt,
  active,
  onClick,
}: {
  receipt: ReceiptCardData;
  active: boolean;
  onClick: () => void;
}) {
  const isRebalance = receipt.kind === "rebalance";

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
        <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
          <Dot tone={isRebalance ? "blue" : "green"} />
          <span
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: active ? C.white : C.text,
              whiteSpace: "nowrap",
            }}
          >
            {isRebalance ? "Switched to better rate" : "Moved to savings"}
          </span>
          <Pill tone="blue">AGENT</Pill>
        </div>

        <span
          style={{
            fontFamily: MONO,
            fontSize: isRebalance ? 11 : 13,
            fontWeight: 600,
            color: isRebalance ? C.textMuted : C.green,
            whiteSpace: "nowrap",
          }}
        >
          {isRebalance ? "Auto" : `+${receipt.amountLabel}`}
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
        <span style={{ fontSize: 11, color: C.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {receipt.finalPoolName ?? "Vault"} · {receipt.apyLabel ?? "—"} APY
        </span>
        <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, whiteSpace: "nowrap" }}>
          {receipt.timestampLabel ?? "—"}
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

function PipelineStep({
  label,
  detail,
  last = false,
}: {
  label: string;
  detail: string;
  last?: boolean;
}) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          width: 18,
          flexShrink: 0,
        }}
      >
        <Check />
        {!last && <div style={{ width: 1, height: 24, background: C.border, margin: "3px auto" }} />}
      </div>

      <div style={{ paddingBottom: last ? 0 : 14 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: C.text }}>{label}</div>
        <div style={{ fontSize: 11, color: C.textMuted, marginTop: 1 }}>{detail}</div>
      </div>
    </div>
  );
}

function ReceiptDetail({ receipt }: { receipt: ReceiptCardData | null }) {
  if (!receipt) {
    return (
      <div style={{ flex: 1, background: C.surface, borderLeft: `1px solid ${C.border}`, padding: 24 }}>
        <div style={{ fontFamily: SANS, fontSize: 13, color: C.textMuted }}>Select a receipt.</div>
      </div>
    );
  }

  const isDeposit = receipt.kind === "deposit";
  const sageDetail =
    receipt.pipeline?.sage?.selectedPool
      ? `${receipt.pipeline.sage.selectedPool} selected · ${receipt.pipeline.sage.confidence ?? "HIGH"} confidence`
      : "Intent parsed into execution plan";
  const sentryDetail =
    receipt.pipeline?.sentry?.verdict
      ? `${receipt.pipeline.sentry.verdict} · Risk ${receipt.pipeline.sentry.riskLevel ?? "NONE"}`
      : "EXECUTE · Risk NONE";
  const accordDetail = receipt.pipeline?.accord?.result ?? "Validated onchain · pool confirmed";
  const vaultDetail = `${receipt.amountLabel} · ${receipt.finalPoolName ?? "Vault"} · ${receipt.apyLabel ?? "—"}`;

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
          {isDeposit ? "Deposit Receipt" : "Rebalance Record"}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
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
              {isDeposit ? `+${receipt.amountLabel}` : receipt.amountLabel}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5 }}>
              <Dot />
              <span style={{ fontSize: 11, color: C.green }}>Confirmed</span>
              <span style={{ color: "#383838" }}>·</span>
              <span style={{ fontFamily: MONO, fontSize: 11, color: C.textMuted }}>
                {receipt.timestampLabel ?? "—"}
              </span>
            </div>
          </div>

          {receipt.riskLabel && (
            <Pill tone={riskTone(receipt.riskLabel)}>
              {receipt.riskLabel} RISK
            </Pill>
          )}
        </div>
      </div>

      {receipt.intentText && (
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
          &quot;{receipt.intentText}&quot;
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <div
          style={{
            fontSize: 10,
            color: C.textMuted,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            marginBottom: 10,
          }}
        >
          Pipeline
        </div>

        <PipelineStep label="Sage" detail={sageDetail} />
        <PipelineStep label="Sentry" detail={sentryDetail} />
        <PipelineStep label="Accord" detail={accordDetail} />
        <PipelineStep label="Vault finalised" detail={vaultDetail} last />
      </div>

      <div
        style={{
          background: C.surface2,
          border: `1px solid ${C.border}`,
          padding: 14,
          marginBottom: 16,
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 3 }}>Pool</div>
            <div style={{ fontSize: 12, color: C.text, fontWeight: 500 }}>{receipt.finalPoolName ?? "—"}</div>
          </div>

          <div>
            <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 3 }}>
              {isDeposit ? "APY at deposit" : "APY gain"}
            </div>
            <div style={{ fontSize: 12, color: C.green, fontWeight: 500 }}>{receipt.apyLabel ?? "—"}</div>
          </div>

          <div>
            <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 3 }}>Finalisation tx</div>
            <div style={{ fontFamily: MONO, fontSize: 11, color: C.accent2, fontWeight: 500 }}>
              <TxHashLink txHash={receipt.txHash} />
            </div>
          </div>

          <div>
            <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 3 }}>Attestation</div>
            <Pill tone="green">RECORDED</Pill>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          style={{
            flex: 1,
            background: "transparent",
            border: `1px solid ${C.border}`,
            padding: 10,
            fontFamily: SANS,
            fontSize: 11,
            color: C.textMuted,
            cursor: "pointer",
          }}
        >
          Export ↗
        </button>

        <button
          type="button"
          style={{
            flex: 2,
            background: C.accent,
            border: "none",
            padding: 10,
            fontFamily: SANS,
            fontSize: 12,
            fontWeight: 600,
            color: C.white,
            cursor: "pointer",
          }}
        >
          Deposit again →
        </button>
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
        <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim, letterSpacing: "0.05em" }}>
          SETTLE · SOMNIA
        </span>
        <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>
          QUILL ATTESTED
        </span>
      </div>
    </div>
  );
}

export function FullReceiptsPage() {
  const { address } = useAccount();
  const { receiptCards, deposits, count, isLoading, error } = useReceiptHistory();
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const rebalances: ReceiptCardData[] = [];

  const visibleReceipts = useMemo(() => {
    if (filter === "rebalance") return rebalances;
    return receiptCards;
  }, [filter, receiptCards]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [filter, count]);

  const selected = visibleReceipts[selectedIndex] ?? null;

  const totalDepositedRaw = useMemo(
    () => deposits.reduce((sum, receipt) => sum + receipt.amount, BigInt(0)),
    [deposits],
  );

  const totalDeposited = Number(totalDepositedRaw) / 1_000_000;

  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        height: "100%",
        minHeight: 0,
        background: C.bg,
        color: C.text,
        fontFamily: SANS,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        borderLeft: `1px solid ${C.border}`,
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Syne:wght@400;500;600;700&display=swap');
      `}</style>

      <div style={{ height: 3, background: C.accent, flexShrink: 0 }} />

      <div
        style={{
          padding: "20px 24px 16px",
          borderBottom: `1px solid ${C.border}`,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexShrink: 0,
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
            Receipts
          </div>
          <div
            style={{
              fontSize: 20,
              fontWeight: 700,
              color: C.white,
              letterSpacing: "-0.02em",
            }}
          >
            Onchain records
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              background: C.surface,
              border: `1px solid ${C.border}`,
              padding: "6px 12px",
              fontSize: 10,
              color: C.textMuted,
              fontFamily: MONO,
            }}
          >
            {shortAddress(address)}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: C.textMuted }}>
            <Dot />
            <span>Somnia Testnet</span>
          </div>
        </div>
      </div>

      <div
        style={{
          padding: "16px 24px",
          borderBottom: `1px solid ${C.borderSoft}`,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", gap: 6 }}>
          <FilterButton active={filter === "all"} onClick={() => setFilter("all")}>All</FilterButton>
          <FilterButton active={filter === "deposit"} onClick={() => setFilter("deposit")}>Deposits</FilterButton>
          <FilterButton active={filter === "rebalance"} onClick={() => setFilter("rebalance")}>Rebalances</FilterButton>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, auto)", gap: 16 }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 2 }}>Total deposited</div>
            <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 600, color: C.green }}>
              +${totalDeposited.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </div>
          </div>

          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 2 }}>Rebalances</div>
            <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 600, color: C.text }}>
              0
            </div>
          </div>

          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 2 }}>Records</div>
            <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 600, color: C.text }}>
              {isLoading ? "…" : count}
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <div
          style={{
            width: 360,
            flexShrink: 0,
            overflowY: "auto",
            borderRight: `1px solid ${C.border}`,
          }}
        >
          {error && (
            <div style={{ padding: 16, color: C.red, fontSize: 12 }}>
              Failed to load receipts: {error.message}
            </div>
          )}

          {isLoading && (
            <div style={{ padding: 16, color: C.textMuted, fontSize: 12 }}>
              Loading receipts...
            </div>
          )}

          {!isLoading && visibleReceipts.length === 0 && (
            <div style={{ padding: 16, color: C.textMuted, fontSize: 12 }}>
              No records found for this filter.
            </div>
          )}

          {visibleReceipts.map((receipt, index) => (
            <ReceiptRow
              key={receipt.receiptId ?? `${receipt.kind}-${index}`}
              receipt={receipt}
              active={index === selectedIndex}
              onClick={() => setSelectedIndex(index)}
            />
          ))}
        </div>

        <ReceiptDetail receipt={selected} />
      </div>
    </div>
  );
}
