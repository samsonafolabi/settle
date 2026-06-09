// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "forge-std/console.sol";

/// @notice Run this after Deploy.s.sol to verify everything is wired correctly
contract PostDeploy is Script {

    function run() external view {
        address vault            = vm.envAddress("VAULT_CONTRACT_ADDRESS");
        address usdc             = vm.envAddress("USDC_ADDRESS");
        address apyFeed          = vm.envAddress("APY_FEED_ADDRESS");
        address attestationStore = vm.envAddress("ATTESTATION_STORE_ADDRESS");
        address trigger          = vm.envAddress("REACTIVE_TRIGGER_ADDRESS");
        address deployer         = vm.envAddress("DEPLOYER_ADDRESS");

        console.log("\n=== POST-DEPLOY VERIFICATION ===");

        // Check vault STT requirement
        (bool ok, bytes memory data) = vault.staticcall(
            abi.encodeWithSignature("getTotalDepositSTT()")
        );
        if (ok) {
            uint256 stt = abi.decode(data, (uint256));
            console.log("Total STT per deposit (wei):", stt);
            console.log("Total STT per deposit (STT):", stt / 1e18);
        }

        // Check USDC balance
        (ok, data) = usdc.staticcall(
            abi.encodeWithSignature("balanceOf(address)", deployer)
        );
        if (ok) {
            uint256 bal = abi.decode(data, (uint256));
            console.log("Deployer USDC balance:", bal / 1e6, "USDC");
        }

        // Check APYFeed pool count
        (ok, data) = apyFeed.staticcall(
            abi.encodeWithSignature("poolCount()")
        );
        if (ok) {
            uint256 count = abi.decode(data, (uint256));
            console.log("APYFeed pool count:", count);
        }

        // Check AttestationStore vault
        (ok, data) = attestationStore.staticcall(
            abi.encodeWithSignature("vault()")
        );
        if (ok) {
            address storeVault = abi.decode(data, (address));
            bool wired = storeVault == vault;
            console.log("AttestationStore vault wired:", wired);
        }

        // Check vault trigger
        (ok, data) = vault.staticcall(
            abi.encodeWithSignature("reactiveTrigger()")
        );
        if (ok) {
            address vaultTrigger = abi.decode(data, (address));
            bool wired = vaultTrigger == trigger;
            console.log("Vault trigger wired:", wired);
        }

        console.log("\n=== ADDRESSES FOR .env ===");
        console.log("VAULT_CONTRACT_ADDRESS=", vault);
        console.log("USDC_ADDRESS=", usdc);
        console.log("APY_FEED_ADDRESS=", apyFeed);
        console.log("ATTESTATION_STORE_ADDRESS=", attestationStore);
        console.log("REACTIVE_TRIGGER_ADDRESS=", trigger);
    }
}
