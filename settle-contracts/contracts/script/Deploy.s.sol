// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "forge-std/console.sol";

import "../src/MockUSDC.sol";
import "../src/APYFeed.sol";
import "../src/AttestationStore.sol";
import "../src/SettleVault.sol";
import "../src/settleReactiveTrigger.sol";

contract Deploy is Script {

    // ── Somnia testnet constants ───────────────────────────────────────────
    address constant ACCORD_PLATFORM = 0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer    = vm.addr(deployerKey);

        console.log("Deployer:        ", deployer);
        console.log("Accord platform: ", ACCORD_PLATFORM);
        console.log("Chain ID:        ", block.chainid);

        vm.startBroadcast(deployerKey);

        // ── 1. MockUSDC ────────────────────────────────────────────────────
        MockUSDC usdc = new MockUSDC();
        console.log("MockUSDC:        ", address(usdc));

        // ── 2. APYFeed ─────────────────────────────────────────────────────
        // Constructor seeds 3 pools automatically:
        //   Pool 0: SETTLE_POOL_A  5.20% LOW
        //   Pool 1: SETTLE_POOL_B  8.71% MED
        //   Pool 2: SETTLE_POOL_C 12.40% HIGH
        APYFeed apyFeed = new APYFeed();
        console.log("APYFeed:         ", address(apyFeed));

        // ── 3. AttestationStore ────────────────────────────────────────────
        AttestationStore attestationStore = new AttestationStore();
        console.log("AttestationStore:", address(attestationStore));

        // ── 4. SettleVault ─────────────────────────────────────────────────
        SettleVault vault = new SettleVault(
            address(usdc),
            address(apyFeed),
            address(attestationStore),
            ACCORD_PLATFORM
        );
        console.log("SettleVault:     ", address(vault));

        // ── 5. Wire AttestationStore → Vault ──────────────────────────────
        attestationStore.setVault(address(vault));
        console.log("AttestationStore vault set");

        // ── 6. SettleReactiveTrigger ───────────────────────────────────────
        SettleReactiveTrigger trigger = new SettleReactiveTrigger(
            address(vault),
            address(apyFeed)
        );
        console.log("ReactiveTrigger: ", address(trigger));

        // ── 7. Wire Vault → ReactiveTrigger ───────────────────────────────
        vault.setReactiveTrigger(address(trigger));
        console.log("Vault trigger set");

        // ── 8. Mint USDC to deployer for testing ───────────────────────────
        usdc.mint(deployer, 10_000 * 1e6); // 10,000 USDC
        console.log("Minted 10,000 USDC to deployer");

        vm.stopBroadcast();

        // ── Summary ────────────────────────────────────────────────────────
        console.log("\n=== DEPLOYMENT COMPLETE ===");
        console.log("MockUSDC:        ", address(usdc));
        console.log("APYFeed:         ", address(apyFeed));
        console.log("AttestationStore:", address(attestationStore));
        console.log("SettleVault:     ", address(vault));
        console.log("ReactiveTrigger: ", address(trigger));
        console.log("\nNext steps:");
        console.log("1. Update .env with new contract addresses");
        console.log("2. Approve vault to spend USDC:");
        console.log("   cast send <USDC> 'approve(address,uint256)' <VAULT> 10000000000 ...");
        console.log("3. Check Accord STT fee:");
        console.log("   cast call <VAULT> 'getTotalDepositSTT()(uint256)' ...");
        console.log("4. Fund your wallet with enough STT for deposits");
    }
}
