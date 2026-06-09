import { useCallback, useState } from "react";
import { formatEther, parseEventLogs, type Hex } from "viem";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { contracts, explorer } from "@/lib/contracts";
import { erc20Abi } from "@/lib/abis/erc20";
import { vaultAbi } from "@/lib/abis/vault";
import { normalizeVaultPosition } from "@/hooks/usePosition";

type FeedType = "info" | "success" | "warning" | "error";

export type MonitorItem = {
  type: FeedType;
  label: string;
  detail: string;
};

type SageApiOutput = {
  amountRaw: string;
  intentText: string;
  slippageBps: number;
  selectedPool: string;
  selectedPoolId: number;
  safetyPrompt: string;
  poolPrompt: string;
  reasoning: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  requiresConfirmation: boolean;
  action: unknown;
};

type SentryVerdict = {
  verdict: "EXECUTE" | "WARNING" | "BLOCKED";
  riskLevel: "NONE" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  summary: string;
  recommendation: string;
  details: string[];
};

export type DepositRunResult = {
  txHash?: Hex;
  depositId?: Hex;
  sage?: SageApiOutput;
  verdict?: SentryVerdict;
  finalStatus?: "finalised" | "refunded" | "timeout" | "blocked" | "cancelled";
  finalPoolId?: number;
  finalApyBps?: bigint;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data?.error ?? `Request failed: ${url}`);
  }

  return data as T;
}

function formatUsdcFromRaw(raw: string | bigint): string {
  const value = typeof raw === "bigint" ? raw : BigInt(raw);
  const n = Number(value) / 1_000_000;

  return n.toLocaleString(undefined, {
    maximumFractionDigits: 2,
  });
}

function formatStt(raw: bigint): string {
  return Number(formatEther(raw)).toLocaleString(undefined, {
    maximumFractionDigits: 6,
  });
}

export function useSettleDeposit(onMonitor?: (item: MonitorItem) => void) {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [running, setRunning] = useState(false);
  const [lastResult, setLastResult] = useState<DepositRunResult | null>(null);

  const push = useCallback(
    (item: MonitorItem) => {
      onMonitor?.(item);
    },
    [onMonitor],
  );

  const waitForPosition = useCallback(
    async (expectedMinBalance: bigint, timeoutMs = 300_000) => {
      if (!publicClient || !address) throw new Error("Wallet not connected");

      const started = Date.now();

      while (Date.now() - started < timeoutMs) {
        const rawPosition = await publicClient.readContract({
          address: contracts.vault,
          abi: vaultAbi,
          functionName: "positions",
          args: [address],
        });

        const position = normalizeVaultPosition(rawPosition);

        if (position.active && position.balance >= expectedMinBalance) {
          return {
            status: "finalised" as const,
            position,
          };
        }

        await sleep(5_000);
      }

      const rawPosition = await publicClient.readContract({
        address: contracts.vault,
        abi: vaultAbi,
        functionName: "positions",
        args: [address],
      });

      return {
        status: "timeout" as const,
        position: normalizeVaultPosition(rawPosition),
      };
    },
    [publicClient, address],
  );

  const run = useCallback(
    async (intent: string): Promise<DepositRunResult> => {
      if (!address) throw new Error("Connect wallet first");
      if (!publicClient || !walletClient) throw new Error("Wallet client unavailable");

      setRunning(true);
      setLastResult(null);

      try {
        push({ type: "info", label: "Okay, I captured your request", detail: `"${intent}"` });

        const sage = await fetchJson<SageApiOutput>("/api/sage", {
          intent,
          wallet: address,
        });

        push({
          type: "success",
          label: "I understood the intent",
          detail: `${sage.selectedPool} • ${formatUsdcFromRaw(sage.amountRaw)} USDC`,
        });

        push({
          type: "info",
          label: "Why I chose this route",
          detail: sage.reasoning,
        });

        const verdict = await fetchJson<SentryVerdict>("/api/sentry", {
          intent,
          wallet: address,
          sageOutput: sage,
        });

        push({
          type:
            verdict.verdict === "EXECUTE"
              ? "success"
              : verdict.verdict === "WARNING"
                ? "warning"
                : "error",
          label: `Sentry says: ${verdict.verdict}`,
          detail: verdict.summary,
        });

        if (verdict.verdict === "BLOCKED") {
          const result: DepositRunResult = {
            sage,
            verdict,
            finalStatus: "blocked",
          };

          setLastResult(result);
          return result;
        }

        if (verdict.verdict === "WARNING") {
          const approved = window.confirm(
            `${verdict.summary}\n\n${verdict.recommendation}\n\nContinue?`,
          );

          if (!approved) {
            push({
              type: "warning",
              label: "You cancelled the approval",
              detail: "Warning was not approved.",
            });

            const result: DepositRunResult = {
              sage,
              verdict,
              finalStatus: "cancelled",
            };

            setLastResult(result);
            return result;
          }
        }

        const amountRaw = BigInt(sage.amountRaw);

        const [beforeRaw, usdcBalance, allowance, sttFee, nativeBalance] =
          await Promise.all([
            publicClient.readContract({
              address: contracts.vault,
              abi: vaultAbi,
              functionName: "positions",
              args: [address],
            }),
            publicClient.readContract({
              address: contracts.usdc,
              abi: erc20Abi,
              functionName: "balanceOf",
              args: [address],
            }),
            publicClient.readContract({
              address: contracts.usdc,
              abi: erc20Abi,
              functionName: "allowance",
              args: [address, contracts.vault],
            }),
            publicClient.readContract({
              address: contracts.vault,
              abi: vaultAbi,
              functionName: "getTotalDepositSTT",
            }),
            publicClient.getBalance({ address }),
          ]);

        if (usdcBalance < amountRaw) {
          throw new Error(
            `Insufficient USDC. Need ${formatUsdcFromRaw(amountRaw)}, wallet has ${formatUsdcFromRaw(usdcBalance)}.`,
          );
        }

        if (nativeBalance < sttFee) {
          throw new Error(
            `Insufficient STT for Accord fee. Need ${formatStt(sttFee)} STT, wallet has ${formatStt(nativeBalance)} STT.`,
          );
        }

        const beforePosition = normalizeVaultPosition(beforeRaw);
        const expectedMinBalance = beforePosition.balance + amountRaw;

        if (allowance < amountRaw) {
          push({
            type: "info",
            label: "I need wallet approval for USDC",
            detail: "Approving vault to spend USDC...",
          });

          const approveHash = await walletClient.writeContract({
            address: contracts.usdc,
            abi: erc20Abi,
            functionName: "approve",
            args: [contracts.vault, amountRaw],
            account: address,
          });

          await publicClient.waitForTransactionReceipt({ hash: approveHash });

          push({
            type: "success",
            label: "USDC approval confirmed",
            detail: approveHash,
          });
        }

        push({
          type: "info",
          label: "I’m sending this to the vault now",
          detail: `Submitting deposit with ${formatStt(sttFee)} STT Accord fee...`,
        });

        const txHash = await walletClient.writeContract({
          address: contracts.vault,
          abi: vaultAbi,
          functionName: "deposit",
          args: [
            amountRaw,
            sage.selectedPoolId,
            sage.intentText,
            sage.safetyPrompt,
            sage.poolPrompt,
          ],
          value: sttFee,
          account: address,
        });

        push({
          type: "success",
          label: "Vault transaction submitted",
          detail: explorer.tx(txHash),
        });

        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

        let depositId: Hex | undefined;

        const initiated = parseEventLogs({
          abi: vaultAbi,
          eventName: "DepositInitiated",
          logs: receipt.logs,
        });

        if (initiated.length > 0) {
          depositId = initiated[0].args.depositId;

          push({
            type: "info",
            label: "I’ve asked Accord to review this",
            detail: `DepositId ${depositId.slice(0, 10)}...`,
          });
        }

        push({
          type: "info",
          label: "I’m waiting for Accord onchain",
          detail: "Accord is validating this onchain. This can take 30–90 seconds on testnet.",
        });

        const terminal = await waitForPosition(expectedMinBalance);

        if (terminal.status === "finalised") {
          push({
            type: "success",
            label: "Done — the vault finalised it",
            detail: `Pool ${terminal.position.poolId} • APY ${Number(terminal.position.poolAPY) / 100}%`,
          });

          const result: DepositRunResult = {
            txHash,
            depositId,
            sage,
            verdict,
            finalStatus: "finalised",
            finalPoolId: terminal.position.poolId,
            finalApyBps: terminal.position.poolAPY,
          };

          setLastResult(result);
          return result;
        }

        push({
          type: "warning",
          label: "Still waiting on the onchain agent",
          detail: "I could not confirm finalisation before timeout. Check the vault position or receipt ledger.",
        });

        const result: DepositRunResult = {
          txHash,
          depositId,
          sage,
          verdict,
          finalStatus: "timeout",
        };

        setLastResult(result);
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown deposit error";

        push({
          type: "error",
          label: "I hit a blocker",
          detail: message,
        });

        throw err;
      } finally {
        setRunning(false);
      }
    },
    [address, publicClient, walletClient, push, waitForPosition],
  );

  return {
    run,
    running,
    lastResult,
  };
}
