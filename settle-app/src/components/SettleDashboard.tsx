"use client";

import React, { useState, useEffect, useRef } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useDisconnect } from "wagmi";
import { usePools } from "@/hooks/usePools";
import { usePosition } from "@/hooks/usePosition";
import { useSttBalance } from "@/hooks/useSttBalance";
import { useSettleDeposit } from "@/hooks/useSettleDeposit";
import { usePoolDepositBreakdown } from "@/hooks/usePoolDepositBreakdown";
import { ReceiptModal } from "@/components/ReceiptModal";
import { buildDepositReceiptFromResult } from "@/lib/buildDepositReceipt";
import type { ReceiptCardData } from "@/components/ReceiptCard";
import { ReceiptCard } from "@/components/ReceiptCard";
import { useReceiptHistory } from "@/hooks/useReceiptHistory";
import { FullReceiptsPage } from "@/components/FullReceiptsPage";
import { DemoCtx } from "@/lib/demoContext";

// ── Demo mode ──────────────────────────────────────────────
// If ?demo=0x... is in the URL, we use that address as a read-only
// wallet so judges can browse all txns without connecting a wallet.
// Connecting a real wallet always takes precedence.
function useDemoAddress(): `0x${string}` | undefined {
  if (typeof window === "undefined") return undefined;
  const params = new URLSearchParams(window.location.search);
  const demo = params.get("demo");
  if (demo && /^0x[a-fA-F0-9]{40}$/.test(demo)) {
    return demo as `0x${string}`;
  }
  return undefined;
}

// Drop-in replacement for useAccount().address — falls back to demo address from DemoCtx
function useViewAddress(): `0x${string}` | undefined {
  const { address } = useAccount();
  const demo = React.useContext(DemoCtx);
  return address ?? (demo as `0x${string}` | undefined);
}

const C = {
  bg: "#0F0F0F",
  surface: "#141414",
  surface2: "#1C1C1C",
  surface3: "#242424",
  border: "#252525",
  borderBright: "#383838",
  accent: "#3324FF",
  accentHover: "#4435FF",
  text: "#D9D9D9",
  textMuted: "#666666",
  textDim: "#3A3A3A",
  green: "#00FF85",
  yellow: "#FFB800",
  red: "#FF4444",
  white: "#FFFFFF",
};

const SANS = "'Inter', 'Segoe UI', system-ui, sans-serif";
const MONO = "'DM Mono', 'Courier New', monospace";

// ── Data ───────────────────────────────────────────────────
const TXS = [
  {
    id: 1,
    type: "Yield Deposit",
    sub: "Somnia Pool A",
    amount: "+500 USDC",
    time: "2m ago",
    status: "verified",
    hash: "0x3f9a...c21b",
    apy: "5.20%",
    byAgent: true,
  },
  {
    id: 2,
    type: "Auto Rebalance",
    sub: "Agent triggered",
    amount: "Auto",
    time: "14m ago",
    status: "verified",
    hash: "0x7d2e...f03a",
    apy: "8.71%",
    byAgent: true,
  },
  {
    id: 3,
    type: "Deposit",
    sub: "From wallet",
    amount: "+1,200 USDC",
    time: "1h ago",
    status: "verified",
    hash: "0xa1b4...9d7c",
    apy: null,
    byAgent: false,
  },
  {
    id: 4,
    type: "Withdraw",
    sub: "To wallet",
    amount: "−200 USDC",
    time: "3h ago",
    status: "pending",
    hash: "0x5c8f...e12d",
    apy: null,
    byAgent: false,
  },
  {
    id: 5,
    type: "Yield Deposit",
    sub: "Somnia Pool C",
    amount: "+800 USDC",
    time: "6h ago",
    status: "verified",
    hash: "0xb3e7...a09f",
    apy: "12.4%",
    byAgent: true,
  },
  {
    id: 6,
    type: "Auto Rebalance",
    sub: "APY dropped below 4%",
    amount: "Auto",
    time: "1d ago",
    status: "verified",
    hash: "0x9c2a...d14e",
    apy: null,
    byAgent: true,
  },
];

const POOLS = [
  {
    name: "Somnia Pool A",
    apy: "5.20",
    risk: "LOW",
    tvl: "$2.4M",
    mine: "$500",
    change: "+0.2",
  },
  {
    name: "Somnia Pool B",
    apy: "8.71",
    risk: "MED",
    tvl: "$890K",
    mine: null,
    change: "-0.5",
  },
  {
    name: "Somnia Pool C",
    apy: "12.4",
    risk: "HIGH",
    tvl: "$340K",
    mine: null,
    change: "+1.1",
  },
];

const AUTOS = [
  {
    id: 1,
    name: "Auto Yield",
    rule: "Balance > 1,000 USDC → deposit excess",
    active: true,
    last: "14m ago",
    triggered: 24,
  },
  {
    id: 2,
    name: "APY Guard",
    rule: "APY < 3% → rebalance to best pool",
    active: true,
    last: "2h ago",
    triggered: 8,
  },
  {
    id: 3,
    name: "Weekly Save",
    rule: "Every Friday → move 10% to yield",
    active: false,
    last: "3d ago",
    triggered: 3,
  },
];

const INIT_FEED = [
  {
    id: 1,
    type: "info" as const,
    label: "Agent Ready",
    detail:
      "Tell me what to do with your USDC. I'll parse, verify, submit, and wait for Accord.",
    time: "now",
  },
];

const DEMO_PROMPTS = [
  { label: "Safest", intent: "deposit 10 USDC into the safest pool" },
  {
    label: "Highest yield",
    intent: "deposit 10 USDC into the highest yield pool",
  },
  { label: "Balanced", intent: "deposit 10 USDC into a balanced pool" },
];

// ── Types ────────────────────────────────────────────────────
type FeedItem = {
  id: number;
  type: "info" | "success" | "warning" | "error";
  label: string;
  detail: string;
  time: string;
};

type ActivityItem = {
  id: string | number;
  type: string;
  sub: string;
  amount: string;
  time: string;
  status: string;
  hash: string;
  apy?: string | null;
  byAgent: boolean;
  receipt?: ReceiptCardData;
};

// ── Helpers ────────────────────────────────────────────────
function Dot({
  color,
  pulse = false,
  size = 7,
}: {
  color: string;
  pulse?: boolean;
  size?: number;
}) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: color,
        flexShrink: 0,
        boxShadow: `0 0 6px ${color}88`,
        animation: pulse ? "blink 2s ease-in-out infinite" : "none",
      }}
    />
  );
}

function Tag({
  children,
  color,
}: {
  children: React.ReactNode;
  color: string;
}) {
  return (
    <span
      style={{
        fontFamily: SANS,
        fontSize: 10,
        fontWeight: 500,
        color,
        background: `${color}18`,
        padding: "2px 7px",
        borderRadius: 3,
        letterSpacing: "0.02em",
      }}
    >
      {children}
    </span>
  );
}

// Agent tag — distinct from status tags
function AgentTag() {
  return (
    <span
      style={{
        fontFamily: SANS,
        fontSize: 9,
        fontWeight: 600,
        color: C.accent,
        background: `${C.accent}18`,
        border: `1px solid ${C.accent}33`,
        padding: "1px 6px",
        borderRadius: 3,
        letterSpacing: "0.05em",
        textTransform: "uppercase",
      }}
    >
      Agent
    </span>
  );
}

function riskColor(r: string): string {
  return r === "LOW" ? C.green : r === "MED" ? C.yellow : C.red;
}

function receiptToActivityRow(
  receipt: ReceiptCardData,
  index = 0,
): ActivityItem {
  return {
    id: receipt.receiptId ?? `receipt-${index}`,
    type: receipt.status === "warning" ? "Intent Mismatch" : "Yield Deposit",
    sub: `${receipt.finalPoolName ?? "Vault"} · ${receipt.apyLabel ?? "—"} APY`,
    amount:
      receipt.kind === "deposit"
        ? `+${receipt.amountLabel}`
        : receipt.amountLabel,
    time: receipt.timestampLabel ?? "—",
    status: receipt.status === "warning" ? "warning" : "verified",
    hash: receipt.txHash
      ? `${receipt.txHash.slice(0, 6)}...${receipt.txHash.slice(-4)}`
      : "Not indexed yet",
    apy: receipt.apyLabel,
    byAgent: true,
    receipt,
  };
}

// ── Approval Overlay ───────────────────────────────────────
function ApprovalOverlay({
  onApprove,
  onReject,
}: {
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(0,0,0,0.85)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backdropFilter: "blur(4px)",
      }}
    >
      <div
        style={{
          background: C.surface,
          border: `1px solid ${C.yellow}`,
          width: 480,
          boxShadow: `0 0 60px ${C.yellow}22, 0 24px 80px rgba(0,0,0,0.8)`,
        }}
      >
        <div
          style={{
            background: `${C.yellow}12`,
            borderBottom: `1px solid ${C.yellow}44`,
            padding: "20px 24px",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              background: `${C.yellow}20`,
              border: `1px solid ${C.yellow}44`,
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 16,
              flexShrink: 0,
            }}
          >
            ⚠
          </div>
          <div>
            <div
              style={{
                fontFamily: SANS,
                fontSize: 11,
                color: C.yellow,
                fontWeight: 600,
                letterSpacing: "0.08em",
                marginBottom: 3,
              }}
            >
              APPROVAL REQUIRED
            </div>
            <div
              style={{
                fontFamily: SANS,
                fontSize: 17,
                color: C.white,
                fontWeight: 600,
              }}
            >
              Your agent needs permission
            </div>
          </div>
        </div>

        <div style={{ padding: "24px" }}>
          <div
            style={{
              background: C.surface2,
              border: `1px solid ${C.border}`,
              padding: "16px 18px",
              marginBottom: 20,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                marginBottom: 14,
              }}
            >
              <div>
                <div
                  style={{
                    fontFamily: SANS,
                    fontSize: 13,
                    color: C.textMuted,
                    marginBottom: 4,
                  }}
                >
                  Transaction
                </div>
                <div
                  style={{
                    fontFamily: SANS,
                    fontSize: 16,
                    color: C.white,
                    fontWeight: 600,
                  }}
                >
                  Yield Deposit
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div
                  style={{
                    fontFamily: SANS,
                    fontSize: 13,
                    color: C.textMuted,
                    marginBottom: 4,
                  }}
                >
                  Amount
                </div>
                <div
                  style={{
                    fontFamily: MONO,
                    fontSize: 18,
                    color: C.green,
                    fontWeight: 600,
                  }}
                >
                  500 USDC
                </div>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 10,
              }}
            >
              {[
                { label: "Protocol", value: "Somnia Pool A" },
                { label: "Est. APY", value: "5.20%" },
                { label: "Receipt", value: "Will be issued" },
                { label: "Chain", value: "Somnia" },
              ].map(({ label, value }) => (
                <div
                  key={label}
                  style={{ background: C.surface3, padding: "10px 12px" }}
                >
                  <div
                    style={{
                      fontFamily: SANS,
                      fontSize: 10,
                      color: C.textMuted,
                      marginBottom: 3,
                    }}
                  >
                    {label}
                  </div>
                  <div
                    style={{
                      fontFamily: SANS,
                      fontSize: 12,
                      color: C.text,
                      fontWeight: 500,
                    }}
                  >
                    {value}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div
            style={{
              background: `${C.yellow}0D`,
              border: `1px solid ${C.yellow}33`,
              padding: "12px 16px",
              marginBottom: 24,
            }}
          >
            <div
              style={{
                fontFamily: SANS,
                fontSize: 11,
                color: C.yellow,
                fontWeight: 600,
                marginBottom: 6,
              }}
            >
              Risk Detected
            </div>
            <div
              style={{
                fontFamily: SANS,
                fontSize: 12,
                color: C.textMuted,
                lineHeight: 1.6,
              }}
            >
              Slippage of <span style={{ color: C.yellow }}>2.1%</span> detected
              — above the safe threshold of 1.0%. This may result in receiving
              less than expected. Sentry flagged this as a critical risk.
            </div>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={onReject}
              style={{
                flex: 1,
                background: "transparent",
                border: `1px solid ${C.border}`,
                padding: "13px",
                cursor: "pointer",
                fontFamily: SANS,
                fontSize: 13,
                fontWeight: 600,
                color: C.textMuted,
                borderRadius: 0,
                transition: "all 0.15s",
              }}
            >
              Reject
            </button>
            <button
              onClick={onApprove}
              style={{
                flex: 2,
                background: C.accent,
                border: "none",
                padding: "13px",
                cursor: "pointer",
                fontFamily: SANS,
                fontSize: 13,
                fontWeight: 600,
                color: C.white,
                borderRadius: 0,
                transition: "all 0.15s",
              }}
            >
              Approve & Sign
            </button>
          </div>

          <div
            style={{
              fontFamily: SANS,
              fontSize: 10,
              color: C.textMuted,
              textAlign: "center",
              marginTop: 12,
            }}
          >
            Approving signs this intent with your wallet. A receipt will be
            recorded after execution.
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sidebar ────────────────────────────────────────────────
function Sidebar({
  active,
  setActive,
}: {
  active: string;
  setActive: (label: string) => void;
}) {
  const items = [
    { label: "Home" },
    { label: "Activity" },
    { label: "Receipts" },
  ];

  return (
    <div
      style={{
        width: 200,
        flexShrink: 0,
        background: C.surface,
        borderRight: `1px solid ${C.border}`,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          padding: "22px 20px 18px",
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 32,
              height: 32,
              background: C.accent,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <div style={{ width: 10, height: 10, background: C.white }} />
          </div>
          <div>
            <div
              style={{
                fontFamily: SANS,
                fontSize: 15,
                fontWeight: 700,
                color: C.white,
                letterSpacing: "-0.01em",
              }}
            >
              Settle
            </div>
            <div style={{ fontFamily: SANS, fontSize: 10, color: C.textMuted }}>
              Trust layer for agentic finance
            </div>
          </div>
        </div>
      </div>

      <nav style={{ flex: 1, padding: "12px 0" }}>
        {items.map(({ label }) => {
          const on = active === label;
          return (
            <button
              key={label}
              onClick={() => setActive(label)}
              style={{
                width: "100%",
                background: on ? C.accent : "transparent",
                border: "none",
                padding: "11px 20px",
                display: "flex",
                alignItems: "center",
                gap: 10,
                cursor: "pointer",
                fontFamily: SANS,
                fontSize: 13,
                fontWeight: on ? 600 : 400,
                color: on ? C.white : C.textMuted,
                textAlign: "left",
                transition: "all 0.12s",
              }}
            >
              {label}
            </button>
          );
        })}
      </nav>

      <div
        style={{
          margin: "0 12px 14px",
          padding: "14px",
          background: C.surface2,
          border: `1px solid ${C.border}`,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 8,
          }}
        >
          <Dot color={C.green} pulse />
          <span
            style={{
              fontFamily: SANS,
              fontSize: 11,
              fontWeight: 600,
              color: C.green,
            }}
          >
            Agent Active
          </span>
        </div>
        <div
          style={{
            fontFamily: SANS,
            fontSize: 11,
            color: C.textMuted,
            lineHeight: 1.6,
          }}
        >
          Live on Somnia
          <br />
          Watching yield pools
        </div>
      </div>
    </div>
  );
}

// ── Top bar ────────────────────────────────────────────────
function TopBar({
  title = "Dashboard",
  demoAddress,
}: {
  title?: string;
  demoAddress?: `0x${string}`;
}) {
  const { disconnect } = useDisconnect();

  return (
    <div
      style={{
        height: 52,
        flexShrink: 0,
        background: C.surface,
        borderBottom: `1px solid ${C.border}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 24px",
      }}
    >
      <div
        style={{
          fontFamily: SANS,
          fontSize: 18,
          fontWeight: 700,
          color: C.white,
        }}
      >
        {title}
      </div>

      <ConnectButton.Custom>
        {({
          account,
          chain,
          mounted,
          openAccountModal,
          openChainModal,
          openConnectModal,
        }) => {
          const ready = mounted;
          const connected = ready && account && chain;

          if (!ready) {
            return (
              <div
                style={{
                  width: 130,
                  height: 30,
                  background: C.surface2,
                  border: `1px solid ${C.border}`,
                  opacity: 0.5,
                }}
              />
            );
          }

          if (!connected) {
            if (demoAddress) {
              return (
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div
                    style={{
                      fontFamily: MONO,
                      fontSize: 11,
                      color: C.accent,
                      padding: "6px 12px",
                      background: `${C.accent}14`,
                      border: `1px solid ${C.accent}44`,
                    }}
                  >
                    {demoAddress.slice(0, 6)}...{demoAddress.slice(-4)} (demo)
                  </div>
                  <button
                    onClick={openConnectModal}
                    type="button"
                    style={{
                      background: C.accent,
                      border: "none",
                      padding: "6px 10px",
                      cursor: "pointer",
                      fontFamily: SANS,
                      fontSize: 11,
                      fontWeight: 600,
                      color: C.white,
                    }}
                  >
                    Connect Wallet
                  </button>
                </div>
              );
            }

            return (
              <button
                onClick={openConnectModal}
                type="button"
                style={{
                  background: C.accent,
                  border: "none",
                  padding: "8px 13px",
                  cursor: "pointer",
                  fontFamily: SANS,
                  fontSize: 12,
                  fontWeight: 600,
                  color: C.white,
                }}
              >
                Connect Wallet
              </button>
            );
          }

          if (chain.unsupported) {
            return (
              <button
                onClick={openChainModal}
                type="button"
                style={{
                  background: `${C.red}18`,
                  border: `1px solid ${C.red}55`,
                  padding: "8px 13px",
                  cursor: "pointer",
                  fontFamily: SANS,
                  fontSize: 12,
                  fontWeight: 600,
                  color: C.red,
                }}
              >
                Wrong Network
              </button>
            );
          }

          return (
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button
                onClick={openAccountModal}
                type="button"
                title="Open wallet details"
                style={{
                  fontFamily: MONO,
                  fontSize: 11,
                  color: C.textMuted,
                  padding: "6px 12px",
                  background: C.surface2,
                  border: `1px solid ${C.border}`,
                  cursor: "pointer",
                }}
              >
                {account.displayName}
              </button>

              <button
                onClick={() => disconnect()}
                type="button"
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Dot color={C.green} size={6} />
                <span
                  style={{
                    fontFamily: SANS,
                    fontSize: 11,
                    color: C.green,
                    fontWeight: 500,
                    textDecoration: "underline",
                    textDecorationColor: `${C.green}66`,
                    textUnderlineOffset: "3px",
                  }}
                >
                  Disconnect
                </span>
              </button>
            </div>
          );
        }}
      </ConnectButton.Custom>
    </div>
  );
}

// ── Middle column ──────────────────────────────────────────
function MiddleColumn({
  selected,
  setSelected,
  activeTab,
  setActiveTab,
}: {
  selected: ActivityItem | null;
  setSelected: (item: ActivityItem | null) => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
}) {
  const tabs = ["Overview", "Activity", "Yield"];

  return (
    <div
      style={{
        width: 460,
        flexShrink: 0,
        borderRight: `1px solid ${C.border}`,
        display: "flex",
        flexDirection: "column",
        background: C.bg,
        overflow: "hidden",
      }}
    >
      {/* Tab bar — thin bottom border indicator, no spanning blue line */}
      <div
        style={{
          display: "flex",
          borderBottom: `1px solid ${C.border}`,
          background: C.surface,
          flexShrink: 0,
        }}
      >
        {tabs.map((tab) => {
          const on = activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                flex: 1,
                background: "none",
                border: "none",
                padding: "14px 6px",
                fontFamily: SANS,
                fontSize: 12,
                fontWeight: on ? 600 : 400,
                color: on ? C.white : C.textMuted,
                cursor: "pointer",
                boxShadow: on ? `inset 0 -2px 0 ${C.accent}` : "none",
                transition: "all 0.12s",
              }}
            >
              {tab}
            </button>
          );
        })}
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          overflowX: "hidden",
        }}
      >
        {activeTab === "Overview" && <OverviewTab />}
        {activeTab === "Activity" && <ActivityList setSelected={setSelected} />}
        {activeTab === "Yield" && <YieldList />}
      </div>
    </div>
  );
}

// ── Overview tab ───────────────────────────────────────────
function OverviewTab() {
  const address = useViewAddress();
  const isConnected = Boolean(address);
  const sttBalance = useSttBalance(address);
  const position = usePosition(address);
  const { pools } = usePools();

  const activePool = pools.find((p) => p.id === position.poolId);
  const poolName =
    activePool?.name ??
    (position.active ? `Pool ${position.poolId}` : "No active position");

  const yieldBalanceLabel = position.active ? `$${position.balance}` : "$0";

  const nativeStt = sttBalance.formatted;

  const portfolioValue = position.active
    ? `$${position.balance}`
    : isConnected
      ? "$0"
      : "Connect wallet";

  const stats = [
    {
      label: "STT Balance",
      value: isConnected ? `${nativeStt} STT` : "—",
      sub: "Gas + Accord fees",
    },
    {
      label: "In Yield",
      value: yieldBalanceLabel,
      sub: position.active ? poolName : "No active position",
    },
    {
      label: "Earning",
      value: position.active ? `${position.apy}% APY` : "0.00% APY",
      sub: "Annual rate",
    },
    {
      label: "Automations",
      value: "2 Active",
      sub: "1 paused",
    },
  ];

  return (
    <div>
      <div
        style={{
          padding: "28px 20px 24px",
          borderBottom: `1px solid ${C.border}`,
          background: C.surface,
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 2,
            background: C.accent,
          }}
        />
        <div
          style={{
            fontFamily: SANS,
            fontSize: 11,
            color: C.textMuted,
            marginBottom: 8,
          }}
        >
          Total Portfolio Value
        </div>
        <div
          style={{
            fontFamily: SANS,
            fontSize: 44,
            fontWeight: 800,
            color: C.white,
            lineHeight: 1,
            letterSpacing: "-0.03em",
          }}
        >
          {portfolioValue}
        </div>
        <div
          style={{
            fontFamily: SANS,
            fontSize: 12,
            color: position.active ? C.green : C.textMuted,
            marginTop: 6,
            fontWeight: 500,
          }}
        >
          {position.active
            ? `Active in ${poolName}`
            : isConnected
              ? "No active yield position"
              : "Connect wallet to load portfolio"}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 1,
          background: C.border,
        }}
      >
        {stats.map((s) => (
          <div key={s.label} style={{ background: C.bg, padding: "16px 18px" }}>
            <div
              style={{
                fontFamily: SANS,
                fontSize: 10,
                color: C.textMuted,
                marginBottom: 6,
              }}
            >
              {s.label}
            </div>
            <div
              style={{
                fontFamily: SANS,
                fontSize: 16,
                color: C.text,
                fontWeight: 600,
              }}
            >
              {s.value}
            </div>
            <div
              style={{
                fontFamily: SANS,
                fontSize: 10,
                color: C.textDim,
                marginTop: 2,
              }}
            >
              {s.sub}
            </div>
          </div>
        ))}
      </div>

      <RecentActivity />
    </div>
  );
}

// ── Activity list ──────────────────────────────────────────
function activityFromReceipt(
  receipt: ReceiptCardData,
  index: number,
): ActivityItem {
  const isWarning = receipt.status === "warning";

  return {
    id: receipt.receiptId ?? index,
    type: isWarning ? "Intent Mismatch" : "Moved to Savings",
    sub: `${receipt.finalPoolName ?? "Vault"} · ${receipt.apyLabel ?? "—"} APY`,
    amount:
      receipt.kind === "deposit"
        ? `+${receipt.amountLabel}`
        : receipt.amountLabel,
    time: receipt.timestampLabel ?? "—",
    status: isWarning ? "warning" : "verified",
    hash: receipt.txHash
      ? `${receipt.txHash.slice(0, 6)}...${receipt.txHash.slice(-4)}`
      : "Not indexed yet",
    apy: receipt.apyLabel,
    byAgent: true,
    receipt,
  };
}

function RecentActivity() {
  const addr = useViewAddress();
  const { receiptCards, isLoading } = useReceiptHistory(addr);
  const latest = receiptCards.slice(0, 3).map(activityFromReceipt);

  return (
    <div style={{ padding: "16px 20px 8px" }}>
      <div
        style={{
          fontFamily: SANS,
          fontSize: 11,
          color: C.textMuted,
          marginBottom: 12,
        }}
      >
        Recent Activity
      </div>

      {isLoading && (
        <div
          style={{
            fontFamily: SANS,
            fontSize: 12,
            color: C.textMuted,
            padding: "10px 0",
          }}
        >
          Loading onchain receipts...
        </div>
      )}

      {!isLoading && latest.length === 0 && (
        <div
          style={{
            fontFamily: SANS,
            fontSize: 12,
            color: C.textMuted,
            padding: "10px 0",
          }}
        >
          No onchain receipts yet.
        </div>
      )}

      {latest.map((tx, i) => (
        <div
          key={`${tx.id}-${i}`}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 0",
            borderBottom: `1px solid ${C.border}`,
          }}
        >
          <Dot color={tx.status === "verified" ? C.green : C.yellow} size={6} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span
                style={{
                  fontFamily: SANS,
                  fontSize: 12,
                  color: C.text,
                  fontWeight: 500,
                }}
              >
                {tx.type}
              </span>
              {tx.byAgent && <AgentTag />}
            </div>
            <div
              style={{
                fontFamily: SANS,
                fontSize: 10,
                color: C.textMuted,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {tx.sub} · {tx.time}
            </div>
          </div>
          <div
            style={{
              fontFamily: MONO,
              fontSize: 12,
              fontWeight: 600,
              color: tx.amount.startsWith("+") ? C.green : C.text,
            }}
          >
            {tx.amount}
          </div>
        </div>
      ))}
    </div>
  );
}

function ActivityList({
  setSelected,
}: {
  setSelected: (item: ActivityItem | null) => void;
}) {
  const addr = useViewAddress();
  const { receiptCards, count, isLoading, error } = useReceiptHistory(addr);
  const activities = receiptCards.map(activityFromReceipt);

  return (
    <div>
      <div
        style={{
          padding: "14px 20px 10px",
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        <div style={{ fontFamily: SANS, fontSize: 11, color: C.textMuted }}>
          {isLoading
            ? "Loading onchain activity..."
            : `${count} onchain records`}
        </div>
      </div>

      {error && (
        <div
          style={{
            padding: "14px 20px",
            borderBottom: `1px solid ${C.border}`,
          }}
        >
          <div style={{ fontFamily: SANS, fontSize: 12, color: C.red }}>
            Failed to load activity: {error.message}
          </div>
        </div>
      )}

      {!isLoading && activities.length === 0 && (
        <div
          style={{
            padding: "18px 20px",
            borderBottom: `1px solid ${C.border}`,
          }}
        >
          <div style={{ fontFamily: SANS, fontSize: 12, color: C.textMuted }}>
            No onchain activity yet.
          </div>
        </div>
      )}

      {activities.map((tx, i) => {
        const col = tx.status === "verified" ? C.green : C.yellow;
        return (
          <div
            key={`${tx.id}-${i}`}
            onClick={() => setSelected(tx)}
            style={{
              padding: "14px 20px",
              borderBottom: `1px solid ${C.border}`,
              borderLeft: `3px solid transparent`,
              background: "transparent",
              cursor: "pointer",
              transition: "all 0.12s",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                marginBottom: 6,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span
                  style={{
                    fontFamily: SANS,
                    fontSize: 13,
                    color: C.text,
                    fontWeight: 400,
                  }}
                >
                  {tx.type}
                </span>
                {tx.byAgent && <AgentTag />}
              </div>
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 13,
                  fontWeight: 600,
                  color: tx.amount.startsWith("+") ? C.green : C.text,
                }}
              >
                {tx.amount}
              </div>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 10,
              }}
            >
              <div
                style={{
                  fontFamily: SANS,
                  fontSize: 11,
                  color: C.textMuted,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {tx.sub}
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  flexShrink: 0,
                }}
              >
                <Dot color={col} size={5} />
                <span
                  style={{ fontFamily: SANS, fontSize: 10, color: C.textMuted }}
                >
                  {tx.time}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Yield list ─────────────────────────────────────────────
function YieldList() {
  const addr = useViewAddress();
  const { pools, isLoading } = usePools();
  const position = usePosition(addr);
  const { byPool, totalDeposited } = usePoolDepositBreakdown(addr);

  return (
    <div>
      <div
        style={{
          padding: "14px 20px 10px",
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        <div style={{ fontFamily: SANS, fontSize: 11, color: C.textMuted }}>
          {isLoading
            ? "Loading live rates..."
            : `Live rates — APYFeed • Deposit receipts: $${totalDeposited}`}
        </div>
      </div>

      {pools.length === 0 && (
        <div
          style={{
            padding: "18px 20px",
            borderBottom: `1px solid ${C.border}`,
          }}
        >
          <div style={{ fontFamily: SANS, fontSize: 12, color: C.textMuted }}>
            No pools loaded yet.
          </div>
        </div>
      )}

      {pools.map((p) => {
        const deposited = byPool[p.id];
        const hasDeposits = deposited && deposited.amountRaw > BigInt(0);
        const isCurrentVaultPool = position.active && position.poolId === p.id;

        return (
          <div
            key={p.id}
            style={{
              padding: "16px 20px",
              borderBottom: `1px solid ${C.border}`,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                marginBottom: 8,
              }}
            >
              <div>
                <div
                  style={{
                    fontFamily: SANS,
                    fontSize: 13,
                    color: C.text,
                    fontWeight: 500,
                    marginBottom: 3,
                  }}
                >
                  {p.name}
                </div>
                <div
                  style={{ fontFamily: SANS, fontSize: 11, color: C.textMuted }}
                >
                  {p.active ? "Active on APYFeed" : "Inactive"}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div
                  style={{
                    fontFamily: MONO,
                    fontSize: 20,
                    color: C.green,
                    fontWeight: 700,
                  }}
                >
                  {p.apy}%
                </div>
                <div
                  style={{ fontFamily: SANS, fontSize: 10, color: C.textMuted }}
                >
                  pool #{p.id}
                </div>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  flexWrap: "wrap",
                }}
              >
                <Tag color={riskColor(p.risk)}>{p.risk} RISK</Tag>
                {isCurrentVaultPool && (
                  <Tag color={C.accent}>Current vault pool</Tag>
                )}
              </div>

              {hasDeposits && (
                <div
                  style={{
                    fontFamily: SANS,
                    fontSize: 11,
                    color: C.accent,
                    fontWeight: 500,
                  }}
                >
                  My deposits: ${deposited.amount}
                </div>
              )}
            </div>

            {hasDeposits && deposited.count > 1 && (
              <div
                style={{
                  fontFamily: SANS,
                  fontSize: 10,
                  color: C.textDim,
                  marginTop: 7,
                  textAlign: "right",
                }}
              >
                {deposited.count} deposit receipts
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Automations list ───────────────────────────────────────
function AutoList() {
  return (
    <div>
      <div
        style={{
          padding: "14px 20px 10px",
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        <div style={{ fontFamily: SANS, fontSize: 11, color: C.textMuted }}>
          {AUTOS.filter((a) => a.active).length} active automations
        </div>
      </div>
      {AUTOS.map((a) => (
        <div
          key={a.id}
          style={{
            padding: "16px 20px",
            borderBottom: `1px solid ${C.border}`,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              marginBottom: 8,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Dot
                color={a.active ? C.green : C.textMuted}
                pulse={a.active}
                size={6}
              />
              <div
                style={{
                  fontFamily: SANS,
                  fontSize: 13,
                  color: C.text,
                  fontWeight: 500,
                }}
              >
                {a.name}
              </div>
            </div>
            <div style={{ fontFamily: SANS, fontSize: 10, color: C.textMuted }}>
              {a.last}
            </div>
          </div>
          <div
            style={{
              fontFamily: SANS,
              fontSize: 11,
              color: C.textMuted,
              lineHeight: 1.5,
              marginBottom: 8,
              paddingLeft: 14,
            }}
          >
            {a.rule}
          </div>
          <div style={{ paddingLeft: 14 }}>
            <Tag color={a.active ? C.green : C.textMuted}>
              {a.active ? "Active" : "Paused"}
            </Tag>
            <span
              style={{
                fontFamily: SANS,
                fontSize: 10,
                color: C.textDim,
                marginLeft: 8,
              }}
            >
              Triggered {a.triggered}× total
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Right column — Agent Monitor ───────────────────────────
function RightPanel({
  selected,
  activeTab,
  onTriggerWarning,
}: {
  selected: ActivityItem | null;
  activeTab: string;
  onTriggerWarning: () => void;
}) {
  const [feed, setFeed] = useState<FeedItem[]>(INIT_FEED);
  const [paused, setPaused] = useState(false);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState("idle");
  const counter = useRef(INIT_FEED.length + 1);

  function add(item: Omit<FeedItem, "id" | "time">) {
    setFeed((p) =>
      [{ id: counter.current++, ...item, time: "just now" }, ...p].slice(0, 40),
    );
  }

  const { run, running } = useSettleDeposit(add);

  async function handleSubmit() {
    if (!input.trim() || mode !== "idle" || running) return;

    const intent = input.trim();
    setInput("");
    setMode("thinking");

    try {
      const result = await run(intent);

      if (result.finalStatus === "finalised") {
        window.dispatchEvent(
          new CustomEvent("settle:receipt", {
            detail: buildDepositReceiptFromResult(result, intent),
          }),
        );
      }
    } finally {
      setMode("idle");
    }
  }

  const busy = mode !== "idle" || running;
  const modeColor = busy ? C.yellow : C.green;
  const modeLabel = busy ? "Processing..." : paused ? "Paused" : "Watching";

  if (activeTab === "Activity" && selected) {
    return (
      <div
        style={{
          flex: 1,
          minWidth: 0,
          width: "100%",
          display: "flex",
          flexDirection: "column",
          height: "100%",
          background: C.bg,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "20px 24px 18px",
            background: C.surface,
            borderBottom: `1px solid ${C.border}`,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              fontFamily: SANS,
              fontSize: 11,
              color: C.textMuted,
              marginBottom: 6,
            }}
          >
            Activity Detail
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 4,
            }}
          >
            <div
              style={{
                fontFamily: SANS,
                fontSize: 18,
                color: C.white,
                fontWeight: 700,
              }}
            >
              {selected.type}
            </div>
            {selected.byAgent && <AgentTag />}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Tag color={selected.status === "verified" ? C.green : C.yellow}>
              {selected.status === "verified" ? "Verified" : "Pending"}
            </Tag>
            <span
              style={{ fontFamily: SANS, fontSize: 11, color: C.textMuted }}
            >
              {selected.time}
            </span>
          </div>
        </div>

        <div style={{ padding: "20px 24px", overflowY: "auto" }}>
          <div
            style={{
              marginBottom: 24,
              padding: "20px",
              background: C.surface,
              border: `1px solid ${C.border}`,
            }}
          >
            <div
              style={{
                fontFamily: SANS,
                fontSize: 11,
                color: C.textMuted,
                marginBottom: 6,
              }}
            >
              Amount
            </div>
            <div
              style={{
                fontFamily: MONO,
                fontSize: 32,
                color: selected.amount.startsWith("+") ? C.green : C.text,
                fontWeight: 700,
              }}
            >
              {selected.amount}
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 10,
              marginBottom: 20,
            }}
          >
            {[
              { label: "Type", value: selected.sub },
              { label: "Hash", value: selected.hash },
              ...(selected.apy ? [{ label: "APY", value: selected.apy }] : []),
              { label: "Chain", value: "Somnia" },
            ].map(({ label, value }) => (
              <div
                key={label}
                style={{
                  padding: "12px 14px",
                  background: C.surface,
                  border: `1px solid ${C.border}`,
                }}
              >
                <div
                  style={{
                    fontFamily: SANS,
                    fontSize: 10,
                    color: C.textMuted,
                    marginBottom: 4,
                  }}
                >
                  {label}
                </div>
                <div style={{ fontFamily: MONO, fontSize: 12, color: C.text }}>
                  {value}
                </div>
              </div>
            ))}
          </div>

          <button
            style={{
              width: "100%",
              background: C.accent,
              border: "none",
              padding: "13px",
              cursor: "pointer",
              fontFamily: SANS,
              fontSize: 13,
              fontWeight: 600,
              color: C.white,
            }}
          >
            View Receipt →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        width: "100%",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: C.bg,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "18px 24px 16px",
          background: C.surface,
          borderBottom: `1px solid ${C.border}`,
          flexShrink: 0,
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 2,
            background: C.accent,
          }}
        />
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <div
              style={{
                fontFamily: SANS,
                fontSize: 15,
                fontWeight: 700,
                color: C.white,
                marginBottom: 4,
              }}
            >
              Agent Monitor
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Dot color={modeColor} pulse={mode !== "idle"} size={6} />
              <span
                style={{
                  fontFamily: SANS,
                  fontSize: 11,
                  color: modeColor,
                  fontWeight: 500,
                }}
              >
                {modeLabel}
              </span>
            </div>
          </div>
          <button
            onClick={() => setPaused((p) => !p)}
            style={{
              background: "none",
              border: `1px solid ${C.border}`,
              padding: "6px 12px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontFamily: SANS,
              fontSize: 11,
              color: C.textMuted,
            }}
          >
            <div
              style={{
                width: 24,
                height: 13,
                position: "relative",
                background: paused ? C.border : C.accent,
                borderRadius: 7,
                transition: "background 0.2s",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: 2,
                  left: paused ? 2 : 11,
                  width: 9,
                  height: 9,
                  background: C.white,
                  borderRadius: "50%",
                  transition: "left 0.2s",
                }}
              />
            </div>
            {paused ? "Paused" : "Live"}
          </button>
        </div>
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          overflowX: "hidden",
        }}
      >
        {feed.map((item, i) => {
          const dc =
            item.type === "success"
              ? C.green
              : item.type === "warning"
                ? C.yellow
                : item.type === "error"
                  ? C.red
                  : C.textMuted;
          return (
            <div
              key={item.id}
              style={{
                display: "flex",
                gap: 12,
                padding: "12px 24px",
                borderBottom: `1px solid ${C.border}`,
                minWidth: 0,
                opacity: Math.max(0.2, 1 - i * 0.055),
                transition: "opacity 0.3s",
              }}
            >
              <div style={{ paddingTop: 4, flexShrink: 0 }}>
                <div
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: dc,
                    boxShadow: i === 0 ? `0 0 8px ${dc}` : "none",
                  }}
                />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: SANS,
                    fontSize: 12,
                    fontWeight: 500,
                    marginBottom: 2,
                    color:
                      item.type === "warning"
                        ? C.yellow
                        : item.type === "error"
                          ? C.red
                          : C.text,
                  }}
                >
                  {item.label}
                </div>
                <div
                  style={{
                    fontFamily: SANS,
                    fontSize: 11,
                    color: C.textMuted,
                    lineHeight: 1.4,
                    overflow: "hidden",
                    overflowWrap: "anywhere",
                    wordBreak: "break-word",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                  }}
                >
                  {item.detail}
                </div>
              </div>
              <div
                style={{
                  fontFamily: SANS,
                  fontSize: 10,
                  color: C.textDim,
                  flexShrink: 0,
                  width: 58,
                  textAlign: "right",
                  paddingTop: 2,
                }}
              >
                {item.time}
              </div>
            </div>
          );
        })}

        {feed.length === 0 && (
          <div
            style={{
              height: "100%",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              padding: 32,
            }}
          >
            <div
              style={{
                fontFamily: SANS,
                fontSize: 13,
                color: C.textDim,
                textAlign: "center",
                lineHeight: 1.8,
              }}
            >
              Watch your agent pay for stuff,
              <br />
              every step of the way here.
            </div>
          </div>
        )}
      </div>

      <div
        style={{
          textAlign: "center",
          padding: "6px",
          borderTop: `1px solid ${C.border}`,
          flexShrink: 0,
        }}
      >
        <svg width="12" height="6" viewBox="0 0 12 6" fill="none">
          <path d="M1 1L6 5L11 1" stroke={C.textDim} strokeWidth="1.5" />
        </svg>
      </div>

      <div
        style={{
          padding: "10px 16px 0",
          borderTop: `1px solid ${C.border}`,
          background: C.surface,
          display: "flex",
          gap: 6,
          flexWrap: "wrap",
          flexShrink: 0,
        }}
      >
        {DEMO_PROMPTS.map((prompt) => (
          <button
            key={prompt.label}
            type="button"
            onClick={() => setInput(prompt.intent)}
            disabled={busy}
            style={{
              background: C.surface2,
              border: `1px solid ${C.border}`,
              padding: "6px 9px",
              cursor: busy ? "not-allowed" : "pointer",
              fontFamily: SANS,
              fontSize: 10,
              color: C.textMuted,
              opacity: busy ? 0.5 : 1,
            }}
          >
            {prompt.label}
          </button>
        ))}
      </div>
      <div
        style={{
          padding: "12px 16px",
          borderTop: `1px solid ${C.border}`,
          flexShrink: 0,
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          background: C.surface,
          minWidth: 0,
          width: "100%",
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          placeholder="Tell me anything..."
          disabled={busy}
          style={{
            flex: 1,
            minWidth: 0,
            background: C.surface2,
            border: `1px solid ${busy ? C.border : C.borderBright}`,
            padding: "10px 14px",
            fontFamily: SANS,
            fontSize: 12,
            color: C.text,
            outline: "none",
            opacity: busy ? 0.5 : 1,
            transition: "all 0.2s",
          }}
        />
        <button
          onClick={handleSubmit}
          disabled={busy}
          style={{
            background: mode !== "idle" ? C.border : C.accent,
            border: "none",
            padding: "0 16px",
            cursor: mode !== "idle" ? "not-allowed" : "pointer",
            flexShrink: 0,
            transition: "background 0.2s",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M1 7H13M13 7L7 1M13 7L7 13"
              stroke="white"
              strokeWidth="1.5"
              strokeLinecap="square"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ── Root ───────────────────────────────────────────────────

function ReceiptsList() {
  const addr = useViewAddress();
  const { receiptCards, count, isLoading, error } = useReceiptHistory(addr);

  return (
    <div>
      <div
        style={{
          padding: "18px 20px 14px",
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        <div
          style={{
            fontFamily: SANS,
            fontSize: 11,
            color: C.textMuted,
            marginBottom: 5,
          }}
        >
          Receipt ledger
        </div>
        <div
          style={{
            fontFamily: SANS,
            fontSize: 22,
            color: C.white,
            fontWeight: 700,
            letterSpacing: "-0.02em",
          }}
        >
          {isLoading ? "Loading..." : `${count} onchain receipts`}
        </div>
        <div
          style={{
            fontFamily: SANS,
            fontSize: 11,
            color: C.textDim,
            marginTop: 5,
          }}
        >
          Source: AttestationStore.getDeposits(wallet)
        </div>
      </div>

      {error && (
        <div style={{ padding: 20, borderBottom: `1px solid ${C.border}` }}>
          <div style={{ fontFamily: SANS, fontSize: 12, color: C.red }}>
            Failed to load receipts: {error.message}
          </div>
        </div>
      )}

      {!isLoading && receiptCards.length === 0 && (
        <div style={{ padding: 20 }}>
          <div style={{ fontFamily: SANS, fontSize: 12, color: C.textMuted }}>
            No receipts found for this wallet yet.
          </div>
        </div>
      )}

      <div
        style={{
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        {receiptCards.map((receipt) => (
          <ReceiptCard key={receipt.receiptId} data={receipt} compact />
        ))}
      </div>
    </div>
  );
}

export default function Settle() {
  const [nav, setNav] = useState("Home");
  const [activeTab, setActiveTab] = useState("Overview");
  const [selected, setSelected] = useState<ActivityItem | null>(null);
  const [showApproval, setShowApproval] = useState(false);
  const [feed, setFeed] = useState<FeedItem[]>(INIT_FEED);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [latestLiveReceipt, setLatestLiveReceipt] =
    useState<ReceiptCardData | null>(null);

  const demoAddress = useDemoAddress();
  const { address: connectedAddress } = useAccount();
  const isDemo = Boolean(demoAddress && !connectedAddress);

  const counter = useRef(INIT_FEED.length + 1);

  useEffect(() => {
    function handleReceipt(event: Event) {
      const receipt = (event as CustomEvent<ReceiptCardData>).detail;
      setLatestLiveReceipt(receipt);
      setReceiptOpen(true);
    }

    window.addEventListener("settle:receipt", handleReceipt);

    return () => {
      window.removeEventListener("settle:receipt", handleReceipt);
    };
  }, []);

  function addToMonitor(item: Omit<FeedItem, "id" | "time">) {
    setFeed((p) => [
      { id: counter.current++, ...item, time: "just now" },
      ...p,
    ]);
  }

  function triggerWarning() {
    addToMonitor({
      type: "warning",
      label: "Verdict: Warning",
      detail: "[CRITICAL] Slippage 2.1% — approval required",
    });
    setShowApproval(true);
  }

  function handleApprove() {
    setShowApproval(false);
    addToMonitor({
      type: "success",
      label: "User Approved",
      detail: "Signature verified — executing...",
    });
    setTimeout(
      () =>
        addToMonitor({
          type: "success",
          label: "Deposit Finalised",
          detail: "Transaction confirmed onchain",
        }),
      1800,
    );
  }

  function handleReject() {
    setShowApproval(false);
    addToMonitor({
      type: "error",
      label: "User Rejected",
      detail: "Cancelled — logged to Quill",
    });
  }

  function handleSidebar(item: string) {
    setNav(item);

    if (item === "Home") {
      setActiveTab("Overview");
      return;
    }

    setActiveTab(item);
  }

  return (
    <DemoCtx.Provider value={demoAddress}>
      <div
        style={{
          display: "flex",
          height: "100vh",
          background: C.bg,
          overflow: "hidden",
          fontFamily: SANS,
        }}
      >
        <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 2px; }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.3} }
        input::placeholder { color: ${C.textDim}; }
        button { transition: opacity 0.12s; }
        button:hover:not(:disabled) { opacity: 0.82; }
      `}</style>

        {showApproval && (
          <ApprovalOverlay onApprove={handleApprove} onReject={handleReject} />
        )}

        <Sidebar active={nav} setActive={handleSidebar} />

        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {isDemo && (
            <div
              style={{
                background: `${C.accent}18`,
                borderBottom: `1px solid ${C.accent}44`,
                padding: "8px 24px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexShrink: 0,
                gap: 12,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: C.accent,
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    fontFamily: SANS,
                    fontSize: 11,
                    color: C.accent,
                    fontWeight: 600,
                  }}
                >
                  DEMO MODE
                </span>
                <span
                  style={{ fontFamily: SANS, fontSize: 11, color: C.textMuted }}
                >
                  — Viewing{" "}
                  <span style={{ fontFamily: MONO, color: C.text }}>
                    {demoAddress?.slice(0, 6)}...{demoAddress?.slice(-4)}
                  </span>
                  . All onchain data is live and read-only.
                </span>
              </div>
              <span
                style={{ fontFamily: SANS, fontSize: 10, color: C.textMuted }}
              >
                Connect your own wallet to transact ↗
              </span>
            </div>
          )}

          <TopBar
            title={
              activeTab === "Receipts"
                ? "Receipts"
                : activeTab === "Activity"
                  ? "Activity"
                  : "Dashboard"
            }
            demoAddress={demoAddress}
          />

          <div
            style={{
              flex: 1,
              minWidth: 0,
              display: "flex",
              overflow: "hidden",
            }}
          >
            {activeTab === "Receipts" ? (
              <FullReceiptsPage />
            ) : (
              <>
                <MiddleColumn
                  selected={selected}
                  setSelected={setSelected}
                  activeTab={activeTab}
                  setActiveTab={setActiveTab}
                />

                <RightPanel
                  selected={selected}
                  activeTab={activeTab}
                  onTriggerWarning={triggerWarning}
                />
              </>
            )}
          </div>
        </div>

        <ReceiptModal
          open={receiptOpen}
          receipt={latestLiveReceipt}
          onClose={() => setReceiptOpen(false)}
          onViewAll={() => {
            setReceiptOpen(false);
            setNav("Receipts");
            setActiveTab("Receipts");
          }}
          onDepositAgain={() => {
            setReceiptOpen(false);
            setNav("Home");
            setActiveTab("Overview");
          }}
        />
      </div>
    </DemoCtx.Provider>
  );
}
