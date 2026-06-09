import "dotenv/config";
import { ethers } from "ethers";

const VAULT_ABI = [
  "function getPendingDeposit(bytes32 depositId) view returns (tuple(address wallet,uint256 amount,uint8 requestedPoolId,string intentText,string poolPrompt,bytes32 depositId,uint8 status))",
  "function getPosition(address wallet) view returns (tuple(uint256 balance,uint256 depositTime,uint256 accruedInterest,uint256 lastClaimTime,uint8 poolId,uint256 poolAPY,bool active))",

  "event DepositInitiated(bytes32 indexed depositId, address indexed wallet, uint256 amount, uint8 poolId)",
  "event AccordVerdictRequested(bytes32 indexed depositId, uint256 indexed requestId)",
  "event AccordPoolRequested(bytes32 indexed depositId, uint256 indexed requestId)",
  "event DepositFinalised(bytes32 indexed depositId, address indexed wallet, uint256 amount, uint8 poolId, uint256 apy)",
  "event DepositRefunded(bytes32 indexed depositId, address indexed wallet, uint256 amount, string reason)",
];

const STATUS = [
  "NONE",
  "SAFETY_PENDING",
  "POOL_PENDING",
  "FINALISED",
  "REFUNDED",
];

async function main() {
  const rpcUrl = process.env.SOMNIA_RPC_URL;
  const vaultAddress = process.env.VAULT_CONTRACT_ADDRESS;
  const depositId = process.argv[2];
  const fromBlockArg = process.argv[3];

  if (!rpcUrl) throw new Error("SOMNIA_RPC_URL not set");
  if (!vaultAddress) throw new Error("VAULT_CONTRACT_ADDRESS not set");
  if (!depositId) {
    throw new Error(
      "Usage: npx tsx scripts/devtools/debug-deposit.ts <depositId> [fromBlock]",
    );
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const vault = new ethers.Contract(vaultAddress, VAULT_ABI, provider);

  const pending = await vault.getPendingDeposit(depositId);
  const wallet = pending.wallet;

  console.log("\nPending deposit");
  console.log("depositId:      ", depositId);
  console.log("wallet:         ", wallet);
  console.log("amount:         ", pending.amount.toString());
  console.log("requestedPoolId:", pending.requestedPoolId.toString());
  console.log(
    "status:         ",
    STATUS[Number(pending.status)] ?? pending.status.toString(),
  );

  if (wallet !== ethers.ZeroAddress) {
    const pos = await vault.getPosition(wallet);

    console.log("\nUser position");
    console.log("active:  ", pos.active);
    console.log("balance: ", pos.balance.toString());
    console.log("poolId:  ", pos.poolId.toString());
    console.log("poolAPY: ", pos.poolAPY.toString());
  }

  const latest = await provider.getBlockNumber();
  const fromBlock = fromBlockArg
    ? Number(fromBlockArg)
    : Math.max(0, latest - 5000);

  console.log(`\nEvents from block ${fromBlock} to ${latest}`);

  const eventNames = [
    "AccordVerdictRequested",
    "AccordPoolRequested",
    "DepositFinalised",
    "DepositRefunded",
  ] as const;

  for (const name of eventNames) {
    const filter = (vault.filters as any)[name](depositId);
    const logs = await vault.queryFilter(filter, fromBlock, latest);

    console.log(`\n${name}: ${logs.length}`);

    for (const log of logs) {
      const parsed = vault.interface.parseLog(log);
      console.log({
        blockNumber: log.blockNumber,
        txHash: log.transactionHash,
        args: parsed?.args.map((x: any) => x?.toString?.() ?? x),
      });
    }
  }
}

main().catch((err) => {
  console.error(err?.message ?? err);
  process.exit(1);
});
