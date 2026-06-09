"use client";

import { useEffect, useMemo, useState } from "react";
import { type Address, parseAbiItem } from "viem";
import { usePublicClient } from "wagmi";
import { contracts } from "@/lib/contracts";
import { receiptTxKey, receiptTxLooseKey } from "@/lib/receiptTxKey";

type ReceiptLike = {
  amount: bigint;
  poolId: number;
  poolName: string;
  timestamp: bigint;
  loggedAt: bigint;
};

type TxHashMap = Map<string, `0x${string}`>;

const depositFinalisedEvent = parseAbiItem(
  "event DepositFinalised(bytes32 indexed depositId,address indexed wallet,uint256 amount,uint8 poolId,uint256 apy)",
);

// Somnia RPC rejects eth_getLogs ranges above 1000 blocks.
const LOG_CHUNK_SIZE = BigInt(950);

// Keep fallback tight so the live app does not spam RPC.
// If you want older demo receipts indexed too, set NEXT_PUBLIC_VAULT_DEPLOY_BLOCK.
const FALLBACK_LOOKBACK_BLOCKS = BigInt(25_000);

function sameTimestamp(a: bigint, b: bigint, toleranceSeconds = BigInt(15)) {
  return a >= b ? a - b <= toleranceSeconds : b - a <= toleranceSeconds;
}

function getConfiguredDeployBlock(latestBlock: bigint) {
  const configured = process.env.NEXT_PUBLIC_VAULT_DEPLOY_BLOCK;

  if (configured && /^\d+$/.test(configured)) {
    return BigInt(configured);
  }

  if (latestBlock > FALLBACK_LOOKBACK_BLOCKS) {
    return latestBlock - FALLBACK_LOOKBACK_BLOCKS;
  }

  return BigInt(0);
}

export function useReceiptTxHashes(
  wallet: Address | undefined,
  receipts: ReceiptLike[],
): TxHashMap {
  const publicClient = usePublicClient();
  const [txHashByKey, setTxHashByKey] = useState<TxHashMap>(() => new Map());

  const receiptSignature = useMemo(
    () =>
      receipts
        .map((receipt) =>
          receiptTxKey({
            amount: receipt.amount,
            poolId: receipt.poolId,
            timestamp: receipt.timestamp,
          }),
        )
        .join("|"),
    [receipts],
  );

  useEffect(() => {
    let cancelled = false;

    async function getChunkedFinalisedLogs() {
      if (!publicClient || !wallet) return [];

      const latestBlock = await publicClient.getBlockNumber();
      const startBlock = getConfiguredDeployBlock(latestBlock);

      const allLogs = [];

      for (
        let fromBlock = startBlock;
        fromBlock <= latestBlock;
        fromBlock += LOG_CHUNK_SIZE + BigInt(1)
      ) {
        const toBlock =
          fromBlock + LOG_CHUNK_SIZE > latestBlock
            ? latestBlock
            : fromBlock + LOG_CHUNK_SIZE;

        try {
          const logs = await publicClient.getLogs({
            address: contracts.vault,
            event: depositFinalisedEvent,
            args: { wallet },
            fromBlock,
            toBlock,
          });

          allLogs.push(...logs);
        } catch (error) {
          console.warn(
            `Failed receipt txhash log chunk ${fromBlock.toString()}-${toBlock.toString()}`,
            error,
          );
        }
      }

      return allLogs;
    }

    async function loadTxHashes() {
      if (!publicClient || !wallet || receipts.length === 0) {
        setTxHashByKey(new Map());
        return;
      }

      try {
        const logs = await getChunkedFinalisedLogs();

        const blockTimestampCache = new Map<bigint, bigint>();

        async function getBlockTimestamp(blockNumber: bigint) {
          const cached = blockTimestampCache.get(blockNumber);
          if (cached !== undefined) return cached;

          const block = await publicClient.getBlock({ blockNumber });
          const timestamp = block.timestamp;
          blockTimestampCache.set(blockNumber, timestamp);

          return timestamp;
        }

        const exact = new Map<string, `0x${string}`>();
        const loose = new Map<string, Array<{
          amount: bigint;
          poolId: number;
          timestamp: bigint;
          txHash: `0x${string}`;
          used: boolean;
        }>>();

        for (const log of logs) {
          const amount = log.args.amount;
          const poolId = log.args.poolId;
          const txHash = log.transactionHash;
          const blockNumber = log.blockNumber;

          if (
            amount === undefined ||
            poolId === undefined ||
            txHash === undefined ||
            blockNumber === undefined
          ) {
            continue;
          }

          const timestamp = await getBlockTimestamp(blockNumber);
          const numericPoolId = Number(poolId);

          const exactKey = receiptTxKey({
            amount,
            poolId: numericPoolId,
            timestamp,
          });

          const looseKey = receiptTxLooseKey({
            amount,
            poolId: numericPoolId,
          });

          exact.set(exactKey, txHash);

          const bucket = loose.get(looseKey) ?? [];
          bucket.push({
            amount,
            poolId: numericPoolId,
            timestamp,
            txHash,
            used: false,
          });
          loose.set(looseKey, bucket);
        }

        const next = new Map<string, `0x${string}`>();

        for (const receipt of receipts) {
          const key = receiptTxKey({
            amount: receipt.amount,
            poolId: receipt.poolId,
            timestamp: receipt.timestamp,
          });

          const exactHit = exact.get(key);
          if (exactHit) {
            next.set(key, exactHit);
            continue;
          }

          const bucket = loose.get(
            receiptTxLooseKey({
              amount: receipt.amount,
              poolId: receipt.poolId,
            }),
          );

          const looseHit = bucket?.find(
            (entry) =>
              !entry.used &&
              sameTimestamp(entry.timestamp, receipt.timestamp),
          );

          if (looseHit) {
            looseHit.used = true;
            next.set(key, looseHit.txHash);
          }
        }

        if (!cancelled) setTxHashByKey(next);
      } catch (error) {
        console.warn("Failed to load receipt tx hashes from DepositFinalised events", error);
        if (!cancelled) setTxHashByKey(new Map());
      }
    }

    loadTxHashes();

    return () => {
      cancelled = true;
    };
  }, [publicClient, wallet, receiptSignature, receipts]);

  return txHashByKey;
}
