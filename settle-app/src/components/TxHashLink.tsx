"use client";

type TxHashLinkProps = {
  txHash?: string | null;
  fallback?: string;
};

const EXPLORER_TX_BASE = "https://shannon-explorer.somnia.network/tx/";

export function TxHashLink({
  txHash,
  fallback = "Not indexed yet",
}: TxHashLinkProps) {
  if (!txHash) {
    return (
      <span style={{ color: "#666", fontSize: 11 }}>
        {fallback}
      </span>
    );
  }

  const href = `${EXPLORER_TX_BASE}${txHash}`;

  async function copyTxHash() {
    try {
      await navigator.clipboard.writeText(txHash ?? "");
    } catch {
      // Clipboard can fail on insecure origins or restricted browsers.
      // The full hash remains visible/selectable as fallback.
    }
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
        minWidth: 0,
        width: "100%",
      }}
    >
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        title={txHash}
        style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: 11,
          lineHeight: 1.45,
          color: "#7B6FFF",
          textDecoration: "none",
          overflowWrap: "anywhere",
          wordBreak: "break-word",
          minWidth: 0,
          flex: 1,
        }}
      >
        {txHash} ↗
      </a>

      <button
        type="button"
        onClick={copyTxHash}
        title="Copy transaction hash"
        style={{
          flexShrink: 0,
          background: "#1C1C1C",
          border: "1px solid #252525",
          color: "#888",
          fontFamily: "'Syne', sans-serif",
          fontSize: 10,
          padding: "4px 7px",
          cursor: "pointer",
        }}
      >
        Copy
      </button>
    </div>
  );
}
