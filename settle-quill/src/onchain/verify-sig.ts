// src/onchain/verify-sig.ts
import { ethers } from "ethers";
import { QuillProof } from "../types/QuillProof";

// Must match buildSigningMessageBytes in attest.ts exactly
// Uses solidityPackedKeccak256 to mirror abi.encodePacked in vault
function reconstructSigningMessageBytes(proof: QuillProof): Uint8Array {
  const proofIdBytes32 = ethers.zeroPadValue(
    ethers.keccak256(ethers.toUtf8Bytes(proof.proofId)),
    32,
  );
  const intentHash32 = ethers.zeroPadValue(
    ethers.getBytes(proof.intentHash),
    32,
  );
  const calldataBytes32 = ethers.zeroPadValue(
    ethers.keccak256(ethers.toUtf8Bytes(proof.calldata)),
    32,
  );

  const messageHash = ethers.solidityPackedKeccak256(
    ["bytes32", "bytes32", "address", "string", "bytes32", "string"],
    [
      proofIdBytes32,
      intentHash32,
      proof.wallet,
      proof.verdict.verdict,
      calldataBytes32,
      proof.chain,
    ],
  );

  return ethers.getBytes(messageHash);
}

export function recoverQuillSigner(proof: QuillProof): string {
  const messageBytes = reconstructSigningMessageBytes(proof);
  return ethers.verifyMessage(messageBytes, proof.quillSig).toLowerCase();
}

export function verifyProofLocally(
  proof: QuillProof,
  expectedQuillAddress: string,
): { valid: boolean; reason?: string } {
  try {
    const recoveredSigner = recoverQuillSigner(proof);
    if (recoveredSigner !== expectedQuillAddress.toLowerCase()) {
      return {
        valid: false,
        reason: `Quill signer mismatch. Expected: ${expectedQuillAddress}, got: ${recoveredSigner}`,
      };
    }

    // Verify user approval signature if present (WARNING path)
    if (proof.approvalSig) {
      const recoveredUser = ethers
        .verifyMessage(ethers.getBytes(proof.intentHash), proof.approvalSig)
        .toLowerCase();

      if (recoveredUser !== proof.wallet.toLowerCase()) {
        return {
          valid: false,
          reason: `User approval signature mismatch. Expected: ${proof.wallet}, got: ${recoveredUser}`,
        };
      }
    }

    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      reason:
        error instanceof Error ? error.message : "Unknown verification error",
    };
  }
}

export async function estimateSubmissionGas(
  proof: QuillProof,
  vaultAddress: string,
  rpcUrl: string,
): Promise<{ vaultGas: bigint; affordable: boolean }> {
  const provider = new ethers.JsonRpcProvider(rpcUrl);

  const VAULT_ABI = [
    "function getTotalDepositSTT() external view returns (uint256)",
    `function depositWithProof(
      uint256 amount,
      string calldata intentText,
      string calldata selectedPool,
      uint256 slippageBps,
      tuple(
        bytes32 proofId,
        bytes32 intentHash,
        string verdict,
        bytes quillSig,
        uint256 issuedAt,
        bytes32 calldataHash,
        bytes approvalSig
      ) proof
    ) external payable`,
  ];

  const vault = new ethers.Contract(vaultAddress, VAULT_ABI, provider);

  const proofIdBytes32 = ethers.zeroPadValue(
    ethers.keccak256(ethers.toUtf8Bytes(proof.proofId)),
    32,
  );
  const intentHashBytes32 = ethers.zeroPadValue(
    ethers.getBytes(proof.intentHash),
    32,
  );
  const calldataBytes32 = ethers.zeroPadValue(
    ethers.keccak256(ethers.toUtf8Bytes(proof.calldata)),
    32,
  );
  const approvalSigBytes = proof.approvalSig
    ? ethers.getBytes(proof.approvalSig)
    : new Uint8Array(0);

  let sttFee: bigint;
  try {
    sttFee = await vault.getTotalDepositSTT();
  } catch {
    sttFee = ethers.parseEther("0.48");
  }

  try {
    const vaultGas = await vault.depositWithProof.estimateGas(
      proof.amountRaw,
      proof.intentText,
      proof.selectedPool,
      proof.slippageBps,
      {
        proofId: proofIdBytes32,
        intentHash: intentHashBytes32,
        verdict: proof.verdict.verdict,
        quillSig: ethers.getBytes(proof.quillSig),
        issuedAt: proof.issuedAt,
        calldataHash: calldataBytes32,
        approvalSig: approvalSigBytes,
      },
      { value: sttFee },
    );

    return { vaultGas, affordable: vaultGas < BigInt(500000) };
  } catch (error) {
    throw new Error(
      `Gas estimation failed — proof likely invalid: ${error instanceof Error ? error.message : error}`,
    );
  }
}
