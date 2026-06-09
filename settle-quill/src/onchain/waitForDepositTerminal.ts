import { ethers } from "ethers";

export const VAULT_TERMINAL_ABI = [
  "function positions(address wallet) view returns (tuple(uint256 balance,uint256 depositTime,uint256 accruedInterest,uint256 lastClaimTime,uint8 poolId,uint256 poolAPY,bool active))",
  "event DepositFinalised(bytes32 indexed depositId, address indexed wallet, uint256 amount, uint8 poolId, uint256 apy)",
  "event DepositRefunded(bytes32 indexed depositId, address indexed wallet, uint256 amount, string reason)",
  "event AccordCallbackReceived(uint256 indexed requestId, bytes32 indexed depositId, bool indexed safetyRequest, uint8 status, uint256 responseCount)",
  "event AccordPoolRequested(bytes32 indexed depositId, uint256 indexed requestId)",
] as const;

export type PositionSnapshot = {
  balance: bigint;
  depositTime: bigint;
  accruedInterest: bigint;
  lastClaimTime: bigint;
  poolId: number;
  poolAPY: bigint;
  active: boolean;
};

export type DepositTerminalResult =
  | {
      status: "finalised";
      source: "event" | "position" | "position-after-timeout";
      txHash?: string;
      amount?: bigint;
      poolId: number;
      apy: bigint;
      position: PositionSnapshot;
    }
  | {
      status: "refunded";
      source: "event";
      txHash?: string;
      amount?: bigint;
      reason: string;
      position: PositionSnapshot;
    }
  | {
      status: "timeout";
      source: "timeout";
      position: PositionSnapshot;
    };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normaliseDepositId(depositId: string): string {
  if (!ethers.isHexString(depositId, 32)) {
    throw new Error(`Invalid depositId bytes32: ${depositId}`);
  }
  return depositId;
}

async function queryFilterChunked(
  contract: ethers.Contract,
  filter: ethers.DeferredTopicFilter,
  fromBlock: number,
  toBlock: number,
  chunkSize = 800,
): Promise<ethers.EventLog[]> {
  const logs: ethers.EventLog[] = [];

  if (toBlock < fromBlock) return logs;

  for (let start = fromBlock; start <= toBlock; start += chunkSize) {
    const end = Math.min(start + chunkSize - 1, toBlock);

    try {
      const chunkLogs = await contract.queryFilter(filter, start, end);
      for (const log of chunkLogs) {
        logs.push(log as ethers.EventLog);
      }
    } catch (error: any) {
      // Somnia RPC can reject large ranges. If it still rejects at 800 blocks,
      // retry this segment with smaller windows instead of failing the whole wait.
      const message = error?.message ?? String(error);
      if (chunkSize > 100 && message.includes("block range")) {
        const smaller = await queryFilterChunked(
          contract,
          filter,
          start,
          end,
          Math.floor(chunkSize / 2),
        );
        logs.push(...smaller);
      } else {
        throw error;
      }
    }
  }

  return logs;
}

export async function getPositionSnapshot(params: {
  provider: ethers.Provider;
  vaultAddress: string;
  wallet: string;
}): Promise<PositionSnapshot> {
  const { provider, vaultAddress, wallet } = params;
  const vault = new ethers.Contract(vaultAddress, VAULT_TERMINAL_ABI, provider);
  const raw = await vault.positions(wallet);

  return {
    balance: BigInt(raw.balance),
    depositTime: BigInt(raw.depositTime),
    accruedInterest: BigInt(raw.accruedInterest),
    lastClaimTime: BigInt(raw.lastClaimTime),
    poolId: Number(raw.poolId),
    poolAPY: BigInt(raw.poolAPY),
    active: Boolean(raw.active),
  };
}

export async function waitForDepositTerminal(params: {
  provider: ethers.JsonRpcProvider;
  vaultAddress: string;
  wallet: string;
  depositId: string;
  expectedMinBalance: bigint;
  fromBlock?: number;
  timeoutMs?: number;
  pollMs?: number;
}): Promise<DepositTerminalResult> {
  const {
    provider,
    vaultAddress,
    wallet,
    expectedMinBalance,
    fromBlock,
    timeoutMs = 300_000,
    pollMs = 5_000,
  } = params;

  const depositId = normaliseDepositId(params.depositId);
  const vault = new ethers.Contract(vaultAddress, VAULT_TERMINAL_ABI, provider);

  const startBlock = fromBlock ?? Math.max(0, (await provider.getBlockNumber()) - 900);
  const startedAt = Date.now();
  let lastCheckedBlock = startBlock;

  while (Date.now() - startedAt < timeoutMs) {
    const latestBlock = await provider.getBlockNumber();

    // 1. Backfill terminal events. This catches events emitted before the listener/poll loop started.
    if (latestBlock >= lastCheckedBlock) {
      const finalisedLogs = await queryFilterChunked(
        vault,
        vault.filters.DepositFinalised(depositId),
        lastCheckedBlock,
        latestBlock,
      );

      if (finalisedLogs.length > 0) {
        const log = finalisedLogs[finalisedLogs.length - 1];
        const parsed = vault.interface.parseLog(log);
        const position = await getPositionSnapshot({ provider, vaultAddress, wallet });

        return {
          status: "finalised",
          source: "event",
          txHash: log.transactionHash,
          amount: BigInt(parsed?.args.amount ?? 0n),
          poolId: Number(parsed?.args.poolId ?? position.poolId),
          apy: BigInt(parsed?.args.apy ?? position.poolAPY),
          position,
        };
      }

      const refundedLogs = await queryFilterChunked(
        vault,
        vault.filters.DepositRefunded(depositId),
        lastCheckedBlock,
        latestBlock,
      );

      if (refundedLogs.length > 0) {
        const log = refundedLogs[refundedLogs.length - 1];
        const parsed = vault.interface.parseLog(log);
        const position = await getPositionSnapshot({ provider, vaultAddress, wallet });

        return {
          status: "refunded",
          source: "event",
          txHash: log.transactionHash,
          amount: BigInt(parsed?.args.amount ?? 0n),
          reason: String(parsed?.args.reason ?? "Unknown refund reason"),
          position,
        };
      }

      lastCheckedBlock = latestBlock + 1;
    }

    // 2. State is the source of truth. If event polling misses logs, positions() still proves finalisation.
    const position = await getPositionSnapshot({ provider, vaultAddress, wallet });

    console.log(
      `   polling position... active=${position.active} balance=${position.balance.toString()} poolId=${position.poolId} apy=${position.poolAPY.toString()}`,
    );

    if (position.active && position.balance >= expectedMinBalance) {
      return {
        status: "finalised",
        source: "position",
        poolId: position.poolId,
        apy: position.poolAPY,
        position,
      };
    }

    await sleep(pollMs);
  }

  // Final sanity check after timeout. This handles finalisation that happened during the last sleep.
  const position = await getPositionSnapshot({ provider, vaultAddress, wallet });

  if (position.active && position.balance >= expectedMinBalance) {
    return {
      status: "finalised",
      source: "position-after-timeout",
      poolId: position.poolId,
      apy: position.poolAPY,
      position,
    };
  }

  return {
    status: "timeout",
    source: "timeout",
    position,
  };
}
