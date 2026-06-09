"use client";

import { ReceiptCard, type ReceiptCardData } from "@/components/ReceiptCard";

const C = {
  bg: "#0F0F0F",
  border: "#252525",
  text: "#D9D9D9",
  textMuted: "#666",
};

const SANS = "'Syne', sans-serif";

export function ReceiptModal({
  receipt,
  open,
  onClose,
  onViewAll,
  onDepositAgain,
}: {
  receipt: ReceiptCardData | null;
  open: boolean;
  onClose: () => void;
  onViewAll?: () => void;
  onDepositAgain?: () => void;
}) {
  if (!open || !receipt) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: "rgba(0,0,0,0.72)",
        backdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        style={{
          width: "min(560px, 100%)",
          maxHeight: "92vh",
          overflowY: "auto",
          background: C.bg,
          border: `1px solid ${C.border}`,
          boxShadow: "0 24px 80px rgba(0,0,0,0.45)",
        }}
      >
        <div
          style={{
            padding: "10px 12px",
            borderBottom: `1px solid ${C.border}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            position: "sticky",
            top: 0,
            background: C.bg,
            zIndex: 2,
          }}
        >
          <span style={{ fontFamily: SANS, fontSize: 11, color: C.textMuted }}>Onchain receipt</span>
          <button
            onClick={onClose}
            type="button"
            style={{
              border: "none",
              background: "transparent",
              color: C.text,
              cursor: "pointer",
              fontFamily: SANS,
              fontSize: 14,
            }}
          >
            Close
          </button>
        </div>

        <div style={{ padding: 16 }}>
          <ReceiptCard data={receipt} />
        </div>

        <div style={{ padding: "0 16px 16px", display: "flex", gap: 8 }}>
          <button
            onClick={onViewAll}
            type="button"
            style={{
              flex: 1,
              background: "transparent",
              border: `1px solid ${C.border}`,
              padding: 10,
              fontFamily: SANS,
              fontSize: 12,
              fontWeight: 500,
              color: C.textMuted,
              cursor: "pointer",
            }}
          >
            All receipts ↗
          </button>
          <button
            onClick={onDepositAgain}
            type="button"
            style={{
              flex: 2,
              background: "#3324FF",
              border: "none",
              padding: 10,
              fontFamily: SANS,
              fontSize: 12,
              fontWeight: 600,
              color: "#fff",
              cursor: "pointer",
            }}
          >
            Deposit again →
          </button>
        </div>
      </div>
    </div>
  );
}
