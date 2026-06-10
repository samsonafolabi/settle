import { useEffect, useState } from "react";
import { createPublicClient, formatEther, http, type Address } from "viem";
import { useAccount } from "wagmi";
import { somniaShannon } from "@/lib/chains";

type SttBalanceState = {
  raw: bigint;
  formatted: string;
  isLoading: boolean;
  error: string | null;
};

const EMPTY: SttBalanceState = {
  raw: BigInt(0),
  formatted: "0",
  isLoading: false,
  error: null,
};

const publicClient = createPublicClient({
  chain: somniaShannon,
  transport: http(
    process.env.NEXT_PUBLIC_SOMNIA_RPC_URL ||
      "https://dream-rpc.somnia.network",
  ),
});

function formatStt(value: bigint): string {
  const n = Number(formatEther(value));
  if (!Number.isFinite(n)) return "0";

  return n.toLocaleString(undefined, {
    maximumFractionDigits: 6,
  });
}

export function useSttBalance(overrideAddress?: `0x${string}`) {
  const { address: _walletAddress, isConnected: _isConnected } = useAccount();
  const address = overrideAddress ?? _walletAddress;
  const isConnected = Boolean(address);
  const [state, setState] = useState<SttBalanceState>(EMPTY);

  useEffect(() => {
    if (!isConnected || !address) {
      setState(EMPTY);
      return;
    }

    // Capture a narrowed address for the async closure.
    // Without this, TypeScript still treats `address` as Address | undefined
    // inside `load()`.
    const wallet: Address = address;
    let cancelled = false;

    async function load() {
      try {
        setState((prev) => ({ ...prev, isLoading: true, error: null }));

        const raw = await publicClient.getBalance({
          address: wallet,
        });

        if (cancelled) return;

        setState({
          raw,
          formatted: formatStt(raw),
          isLoading: false,
          error: null,
        });
      } catch (err) {
        if (cancelled) return;

        setState({
          raw: BigInt(0),
          formatted: "0",
          isLoading: false,
          error:
            err instanceof Error ? err.message : "Failed to load STT balance",
        });
      }
    }

    load();
    const timer = window.setInterval(load, 10_000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [address, isConnected]);

  return state;
}
