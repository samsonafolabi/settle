export type ReceiptTxKeyInput = {
  amount: bigint;
  poolId: number;
  timestamp?: bigint;
  loggedAt?: bigint;
};

export function receiptTxKey(input: ReceiptTxKeyInput): string {
  const amount = input.amount.toString();
  const pool = String(input.poolId);
  const timestamp = (input.timestamp ?? input.loggedAt ?? BigInt(0)).toString();

  return [amount, pool, timestamp].join(":");
}

export function receiptTxLooseKey(input: ReceiptTxKeyInput): string {
  const amount = input.amount.toString();
  const pool = String(input.poolId);

  return [amount, pool].join(":");
}
