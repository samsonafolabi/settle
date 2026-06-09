import { formatUnits } from "viem";

export function formatUsdc(value: bigint | undefined, decimals = 6): string {
  if (value === undefined) return "0";
  const n = Number(formatUnits(value, decimals));
  return n.toLocaleString(undefined, {
    maximumFractionDigits: 2,
  });
}

export function formatApy(apyBps: bigint | number | undefined): string {
  if (apyBps === undefined) return "0.00";
  return (Number(apyBps) / 100).toFixed(2);
}

export function shortHash(value?: string, chars = 4): string {
  if (!value) return "";
  return `${value.slice(0, 2 + chars)}...${value.slice(-chars)}`;
}

export function timeAgo(unixSeconds: bigint | number): string {
  const seconds = typeof unixSeconds === "bigint" ? Number(unixSeconds) : unixSeconds;
  const diff = Math.max(0, Math.floor(Date.now() / 1000) - seconds);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
