// scripts/generate-keys.ts
// Run ONCE — save the output securely, never run again
// Never commit the output to GitHub

import { ethers } from "ethers";

const wallet = ethers.Wallet.createRandom();

console.log("\n=== QUILL SERVICE KEYS — SAVE THESE SECURELY ===");
console.log("QUILL_SIGNING_KEY (private — goes in .env):");
console.log(wallet.privateKey);
console.log("\nQUILL_SERVICE_ADDRESS (public — goes in contracts .env):");
console.log(wallet.address);
console.log("\n⚠  Never commit QUILL_SIGNING_KEY to GitHub");
console.log("================================================\n");
