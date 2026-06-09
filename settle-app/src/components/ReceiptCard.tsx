"use client";

import { explorer } from "@/lib/contracts";
import { TxHashLink } from "@/components/TxHashLink";

const C = {
  bg: "#0F0F0F",
  surface: "#141414",
  border: "#252525",
  borderSoft: "#1a1a1a",
  text: "#D9D9D9",
  textMuted: "#666",
  textDim: "#3A3A3A",
  white: "#fff",
  accent: "#3324FF",
  accent2: "#7B6FFF",
  green: "#00FF85",
  yellow: "#FFD166",
  red: "#FF4D4D",
};

const SANS = "'Syne', sans-serif";
const MONO = "'IBM Plex Mono', monospace";

export type ReceiptCardData = {
  kind: "deposit" | "payment" | "rebalance";
  receiptId?: string;
  amountLabel: string;
  status?: "confirmed" | "pending" | "refunded" | "warning";
  intentText: string;
  finalPoolName?: string;
  finalPoolId?: number;
  apyLabel?: string;
  riskLabel?: string;
  chainLabel?: string;
  timestampLabel?: string;
  txHash?: string;
  attestationStatus?: "RECORDED" | "PENDING" | "FAILED";
  pipeline?: {
    sage?: {
      selectedPool?: string;
      confidence?: "HIGH" | "MEDIUM" | "LOW";
      reasoning?: string;
    };
    sentry?: {
      verdict?: "EXECUTE" | "WARNING" | "BLOCKED";
      riskLevel?: string;
      summary?: string;
    };
    accord?: {
      status?: "Approved" | "Blocked" | "Pending" | "Override";
      result?: string;
      requestId?: string | number;
    };
  };
};

function Pill({
  children,
  tone = "gray",
}: {
  children: React.ReactNode;
  tone?: "green" | "blue" | "gray" | "yellow" | "red";
}) {
  const map = {
    green: { background: `${C.green}14`, color: C.green, border: `1px solid ${C.green}30` },
    blue: { background: `${C.accent}14`, color: C.accent2, border: `1px solid ${C.accent}30` },
    gray: { background: "#25252566", color: "#888", border: "1px solid #383838" },
    yellow: { background: `${C.yellow}14`, color: C.yellow, border: `1px solid ${C.yellow}30` },
    red: { background: `${C.red}14`, color: C.red, border: `1px solid ${C.red}30` },
  } as const;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 8px",
        borderRadius: 2,
        fontFamily: SANS,
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: "0.05em",
        ...map[tone],
      }}
    >
      {children}
    </span>
  );
}

function Check({ tone = "green" }: { tone?: "green" | "yellow" | "red" }) {
  const color = tone === "green" ? C.green : tone === "yellow" ? C.yellow : C.red;

  return (
    <div
      style={{
        width: 20,
        height: 20,
        borderRadius: "50%",
        background: `${color}20`,
        border: `1px solid ${color}44`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
        <path d="M2 5l2 2 4-4" stroke={color} strokeWidth="1.5" strokeLinecap="square" />
      </svg>
    </div>
  );
}

function PipelineStep({
  title,
  detail,
  last = false,
  tone = "green",
}: {
  title: string;
  detail: React.ReactNode;
  last?: boolean;
  tone?: "green" | "yellow" | "red";
}) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
        <Check tone={tone} />
        {!last && <div style={{ width: 1, height: 28, background: C.border, margin: "3px 0" }} />}
      </div>

      <div style={{ paddingBottom: last ? 0 : 16 }}>
        <div style={{ fontFamily: SANS, fontSize: 12, fontWeight: 500, color: C.text, marginBottom: 2 }}>
          {title}
        </div>
        <div style={{ fontFamily: SANS, fontSize: 11, color: C.textMuted }}>{detail}</div>
      </div>
    </div>
  );
}

function shortHash(hash?: string) {
  if (!hash) return "—";
  return `${hash.slice(0, 6)}...${hash.slice(-4)}`;
}

function detectOverride(data: ReceiptCardData) {
  const selected = data.pipeline?.sage?.selectedPool;
  return Boolean(selected && data.finalPoolName && selected !== data.finalPoolName);
}

function statusTone(status: ReceiptCardData["status"], override: boolean) {
  if (override) return "yellow";
  if (status === "refunded") return "red";
  if (status === "warning" || status === "pending") return "yellow";
  return "green";
}

function statusLabel(status: ReceiptCardData["status"], override: boolean) {
  if (override) return "Override";
  if (status === "refunded") return "Refunded";
  if (status === "warning") return "Needs Review";
  if (status === "pending") return "Pending";
  return "Confirmed";
}

function titleForKind(kind: ReceiptCardData["kind"]) {
  if (kind === "payment") return "Payment Receipt";
  if (kind === "rebalance") return "Rebalance Receipt";
  return "Deposit Receipt";
}

export function ReceiptCard({
  data,
  compact = false,
}: {
  data: ReceiptCardData;
  compact?: boolean;
}) {
  const override = detectOverride(data);
  const tone = statusTone(data.status, override);

  return (
    <div
      style={{
        fontFamily: SANS,
        background: C.bg,
        color: C.text,
        maxWidth: 520,
        margin: "0 auto",
        border: `1px solid ${C.border}`,
        width: "100%",
      }}
    >
      <div style={{ height: 3, background: override ? C.yellow : C.accent }} />

      <div style={{ padding: "20px 20px 16px", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
          <div>
            <div style={{ fontSize: 10, color: C.textMuted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>
              {titleForKind(data.kind)}
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: C.white, letterSpacing: "-0.02em" }}>
              {data.amountLabel}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: tone === "green" ? C.green : tone === "yellow" ? C.yellow : C.red,
                  display: "inline-block",
                  boxShadow: `0 0 6px ${tone === "green" ? C.green : tone === "yellow" ? C.yellow : C.red}88`,
                }}
              />
              <span style={{ fontSize: 11, color: tone === "green" ? C.green : tone === "yellow" ? C.yellow : C.red, fontWeight: 500 }}>
                {statusLabel(data.status, override)}
              </span>
              <span style={{ color: "#383838" }}>·</span>
              <span style={{ fontFamily: MONO, color: C.textMuted, fontSize: 12 }}>{data.timestampLabel ?? "Just now"}</span>
            </div>
          </div>

          <div style={{ textAlign: "right" }}>
            <div style={{ marginBottom: 6 }}><Pill tone="blue">AGENT</Pill></div>
            <div style={{ fontSize: 10, color: C.textMuted }}>{data.finalPoolName ?? "—"}</div>
            <div style={{ fontSize: 12, color: C.green, fontWeight: 600, marginTop: 2 }}>{data.apyLabel ?? "—"}</div>
          </div>
        </div>
      </div>

      <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.borderSoft}` }}>
        <div style={{ fontSize: 10, color: C.textMuted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>
          What you asked
        </div>
        <div
          style={{
            background: C.surface,
            border: `1px solid ${C.border}`,
            borderLeft: `2px solid ${override ? C.yellow : C.accent}`,
            padding: "10px 12px",
            fontSize: 13,
            color: C.text,
            fontStyle: "italic",
          }}
        >
          &quot;{data.intentText || "No intent text recorded"}&quot;
        </div>
      </div>

      {!compact && (
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.borderSoft}` }}>
          <div style={{ fontSize: 10, color: C.textMuted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12 }}>
            Pipeline
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            <PipelineStep
              title="Sage parsed intent"
              detail={
                <>
                  Selected {data.pipeline?.sage?.selectedPool ?? data.finalPoolName ?? "—"}
                  {data.pipeline?.sage?.reasoning ? ` — ${data.pipeline.sage.reasoning}` : " — intent translated into execution plan"}
                  {data.pipeline?.sage?.confidence ? <> · <span style={{ color: "#888" }}>{data.pipeline.sage.confidence} confidence</span></> : null}
                </>
              }
            />

            <PipelineStep
              title="Sentry verified"
              detail={
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3, flexWrap: "wrap" }}>
                  <Pill tone={data.pipeline?.sentry?.verdict === "WARNING" ? "yellow" : "green"}>
                    {data.pipeline?.sentry?.verdict ?? "EXECUTE"}
                  </Pill>
                  <span>Risk: {data.pipeline?.sentry?.riskLevel ?? "NONE"} · {data.pipeline?.sentry?.summary ?? "checks passed"}</span>
                </div>
              }
            />

            <PipelineStep
              title="Accord validated onchain"
              tone={override ? "yellow" : "green"}
              detail={
                override
                  ? `Override detected: Sage selected ${data.pipeline?.sage?.selectedPool}, vault finalised ${data.finalPoolName}`
                  : data.pipeline?.accord?.result ?? `Pool confirmed · final pool ${data.finalPoolId ?? "—"}`
              }
            />

            <PipelineStep
              title="Vault finalised"
              last
              detail={`${data.amountLabel} ${data.kind === "deposit" ? "deposited into" : "processed through"} ${data.finalPoolName ?? "vault"}${data.apyLabel ? ` at ${data.apyLabel}` : ""}`}
            />
          </div>
        </div>
      )}

      <div style={{ padding: "16px 20px", background: C.surface, borderBottom: `1px solid ${C.borderSoft}` }}>
        <div style={{ fontSize: 10, color: C.textMuted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>
          Onchain details
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <div style={{ fontSize: 10, color: C.textMuted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>Pool</div>
            <div style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>{data.finalPoolName ?? "—"}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: C.textMuted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>APY at deposit</div>
            <div style={{ fontSize: 13, color: C.green, fontWeight: 500 }}>{data.apyLabel ?? "—"}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: C.textMuted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>Risk</div>
            <Pill tone={data.riskLabel === "HIGH" ? "red" : data.riskLabel === "MED" ? "yellow" : "green"}>
              {data.riskLabel ?? "—"}
            </Pill>
          </div>
          <div>
            <div style={{ fontSize: 10, color: C.textMuted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>Chain</div>
            <div style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>{data.chainLabel ?? "Somnia Testnet"}</div>
          </div>
        </div>
      </div>

      <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.borderSoft}` }}>
        <div style={{ fontSize: 10, color: C.textMuted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>
          Verification
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <span style={{ color: C.textMuted, fontSize: 12 }}>Submit tx</span>
            {data.txHash ? (
              <a href={explorer.tx(data.txHash)} target="_blank" rel="noreferrer" style={{ fontFamily: MONO, fontSize: 12, color: C.accent2, textDecoration: "none" }}>
                {shortHash(data.txHash)} ↗
              </a>
            ) : (
              <span style={{ fontFamily: MONO, fontSize: 12, color: C.textMuted }}>—</span>
            )}
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <span style={{ color: C.textMuted, fontSize: 12 }}>AttestationStore</span>
            <Pill tone={data.attestationStatus === "FAILED" ? "red" : data.attestationStatus === "PENDING" ? "yellow" : "green"}>
              {data.attestationStatus ?? "RECORDED"}
            </Pill>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <span style={{ color: C.textMuted, fontSize: 12 }}>Receipt ID</span>
            <span style={{ fontFamily: MONO, color: C.textMuted, fontSize: 11 }}>{data.receiptId ?? "—"}</span>
          </div>
        </div>
      </div>

      <div style={{ padding: "10px 20px", borderTop: `1px solid ${C.borderSoft}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 10, color: C.textDim, letterSpacing: "0.05em" }}>SETTLE · SOMNIA</span>
        <span style={{ fontFamily: MONO, fontSize: 10, color: C.textDim }}>QUILL ATTESTED</span>
      </div>
    </div>
  );
}
