// src/onchain/submit.ts
import { ethers } from "ethers";
import { QuillProof } from "../types/QuillProof";
import { updateRecord } from "../core/store";

// New vault ABI — deposit(uint256, uint8, string, string, string)
// No QuillProof struct — Accord is the sole gatekeeper
const VAULT_ABI = [
  "function getTotalDepositSTT() external view returns (uint256)",
  "function deposit(uint256 amount, uint8 poolId, string calldata intentText, string calldata safetyPrompt, string calldata poolPrompt) external payable",
  "event DepositInitiated(bytes32 indexed depositId, address indexed wallet, uint256 amount, uint8 poolId)",
  "event DepositFinalised(bytes32 indexed depositId, address indexed wallet, uint256 amount, uint8 poolId, uint256 apy)",
  "event DepositRefunded(bytes32 indexed depositId, address indexed wallet, uint256 amount, string reason)",
  "event AccordVerdictRequested(bytes32 indexed depositId, uint256 indexed requestId)",
];

function getProvider(): ethers.JsonRpcProvider {
  const rpcUrl = process.env.SOMNIA_RPC_URL;
  if (!rpcUrl) throw new Error("SOMNIA_RPC_URL not set");
  return new ethers.JsonRpcProvider(rpcUrl);
}

function getSubmissionWallet(provider: ethers.JsonRpcProvider): ethers.Wallet {
  const privateKey = process.env.QUILL_SUBMISSION_KEY;
  if (!privateKey) throw new Error("QUILL_SUBMISSION_KEY not set");
  return new ethers.Wallet(privateKey, provider);
}

export type SubmissionResult = {
  vaultTxHash: string;
  depositId?: string; // bytes32 from DepositInitiated event
  accordRequestId?: string; // from AccordVerdictRequested event
};

export async function submitProof(
  proof: QuillProof,
): Promise<SubmissionResult> {
  const vaultAddress = process.env.VAULT_CONTRACT_ADDRESS;
  if (!vaultAddress) throw new Error("VAULT_CONTRACT_ADDRESS not set");

  const provider = getProvider();
  const wallet = getSubmissionWallet(provider);
  const vault = new ethers.Contract(vaultAddress, VAULT_ABI, wallet);

  // Get STT fee for 2 Accord calls
  let sttFee: bigint;
  try {
    sttFee = await vault.getTotalDepositSTT();
    console.log("STT fee:", ethers.formatEther(sttFee), "STT");
  } catch {
    sttFee = ethers.parseEther("0.48");
    console.log("STT fee (fallback): 0.48 STT");
  }

  // Send deposit — safetyPrompt and poolPrompt built by Sage
  const tx = await vault.deposit(
    proof.amountRaw,
    proof.selectedPoolId,
    proof.intentText,
    proof.safetyPrompt,
    proof.poolPrompt,
    { value: sttFee },
  );

  console.log("Tx hash:", tx.hash);

  const receipt = await tx.wait();
  if (!receipt) throw new Error("No receipt");

  if (receipt.status === 0) {
    throw new Error(`Vault reverted. Tx: ${receipt.hash}`);
  }

  // Parse events
  const iface = vault.interface;
  let depositId: string | undefined;
  let accordRequestId: string | undefined;

  for (const log of receipt.logs) {
    try {
      const parsed = iface.parseLog(log);
      if (!parsed) continue;
      if (parsed.name === "DepositInitiated") {
        depositId = parsed.args.depositId;
        console.log("DepositId:", depositId);
      }
      if (parsed.name === "AccordVerdictRequested") {
        accordRequestId = parsed.args.requestId.toString();
        console.log("Accord requestId:", accordRequestId);
      }
    } catch {
      /* skip */
    }
  }

  updateRecord(proof.intentId, {
    status: "SUBMITTED",
    txHash: receipt.hash,
    submittedAt: Date.now(),
  });

  proof.txHash = receipt.hash;

  return { vaultTxHash: receipt.hash, depositId, accordRequestId };
}

// Poll for deposit finalisation — Accord callbacks happen async
export async function waitForFinalisation(
  vaultAddress: string,
  depositId: string, // bytes32 from DepositInitiated
  timeoutMs = 120_000,
): Promise<{
  status: "finalised" | "refunded" | "timeout";
  poolId?: number;
  apy?: number;
  reason?: string;
}> {
  const rpcUrl = process.env.SOMNIA_RPC_URL;
  if (!rpcUrl) throw new Error("SOMNIA_RPC_URL not set");

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const vault = new ethers.Contract(vaultAddress, VAULT_ABI, provider);

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      vault.removeAllListeners();
      resolve({ status: "timeout" });
    }, timeoutMs);

    vault.on(
      "DepositFinalised",
      (
        _wallet: string,
        did: string,
        _amount: bigint,
        poolId: number,
        apy: bigint,
      ) => {
        if (did === depositId) {
          clearTimeout(timeout);
          vault.removeAllListeners();
          resolve({ status: "finalised", poolId, apy: Number(apy) });
        }
      },
    );

    vault.on(
      "DepositRefunded",
      (_wallet: string, did: string, _amount: bigint, reason: string) => {
        if (did === depositId) {
          clearTimeout(timeout);
          vault.removeAllListeners();
          resolve({ status: "refunded", reason });
        }
      },
    );
  });
}
