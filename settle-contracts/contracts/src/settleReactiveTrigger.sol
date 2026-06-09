// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/SomniaEventHandler.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/ISettle.sol";

contract SettleReactiveTrigger is SomniaEventHandler, Ownable {

    ISettleVault public immutable vault;
    IAPYFeed     public immutable apyFeed;

    // Must match APYFeed.APYUpdated(uint256,string,uint256,uint256,uint256)
    bytes32 public constant APY_UPDATED_TOPIC =
        keccak256("APYUpdated(uint256,string,uint256,uint256,uint256)");

    // Must match SettleVault.DepositFinalised(bytes32,address,uint256,uint8,uint256)
    bytes32 public constant DEPOSIT_FINALISED_TOPIC =
        keccak256("DepositFinalised(bytes32,address,uint256,uint8,uint256)");

    mapping(address => bool) public registeredWallets;
    address[] public walletList;

    event RebalanceTriggered(
        address indexed wallet,
        uint8   fromPoolId,
        uint8   toPoolId,
        uint256 oldAPY,
        uint256 newAPY
    );

    event WalletRegistered(address indexed wallet);

    error ZeroAddress();

    constructor(address _vault, address _apyFeed) Ownable(msg.sender) {
        if (_vault   == address(0)) revert ZeroAddress();
        if (_apyFeed == address(0)) revert ZeroAddress();
        vault   = ISettleVault(_vault);
        apyFeed = IAPYFeed(_apyFeed);
    }

    function _onEvent(
        address,
        bytes32[] calldata eventTopics,
        bytes calldata data
    ) internal override {
        if (eventTopics.length == 0) return;

        bytes32 topic = eventTopics[0];

        if (topic == APY_UPDATED_TOPIC) {
            _handleAPYUpdate(data);
            return;
        }

        if (topic == DEPOSIT_FINALISED_TOPIC) {
            _handleDepositFinalised(eventTopics);
            return;
        }
    }

    function _handleAPYUpdate(bytes calldata data) internal {
        // APYUpdated non-indexed data: oldAPY, newAPY, timestamp
        (, uint256 oldAPY, uint256 newAPY, ) =
            abi.decode(data, (uint256, uint256, uint256, uint256));

        // Only rebalance if APY dropped
        if (newAPY >= oldAPY) return;

        // Find best pool by APY
        (uint8 bestPoolId, uint256 bestAPY) = _findBestPool();
        if (bestAPY == 0) return;

        for (uint256 i = 0; i < walletList.length; i++) {
            address wallet    = walletList[i];
            uint256 threshold = vault.userAPYThreshold(wallet);
            if (threshold == 0) continue;

            ISettleVault.UserPosition memory pos = vault.getPosition(wallet);
            if (!pos.active || pos.balance == 0) continue;
            if (pos.poolId == bestPoolId) continue;       // already on best pool
            if (pos.poolAPY >= threshold) continue;       // still above threshold
            if (bestAPY <= pos.poolAPY) continue;         // no improvement

            vault.rebalance(wallet, bestPoolId);

            emit RebalanceTriggered(
                wallet,
                pos.poolId,
                bestPoolId,
                pos.poolAPY,
                bestAPY
            );
        }
    }

    function _handleDepositFinalised(bytes32[] calldata eventTopics) internal {
        // DepositFinalised: topics[1] = depositId (bytes32), topics[2] = wallet (address)
        if (eventTopics.length < 3) return;

        address wallet = address(uint160(uint256(eventTopics[2])));
        if (wallet == address(0)) return;

        if (!registeredWallets[wallet]) {
            registeredWallets[wallet] = true;
            walletList.push(wallet);
            emit WalletRegistered(wallet);
        }
    }

    function _findBestPool() internal view returns (uint8 bestId, uint256 bestAPY) {
        uint256 count = apyFeed.poolCount();
        bestId  = 0;
        bestAPY = 0;
        for (uint256 i = 0; i < count; i++) {
            IAPYFeed.Pool memory pool = apyFeed.getPool(i);
            if (pool.active && pool.apy > bestAPY) {
                bestAPY = pool.apy;
                bestId  = uint8(i);
            }
        }
    }

    // ── Owner utils ────────────────────────────────────────────────────────

    function registerWallet(address wallet) external onlyOwner {
        if (!registeredWallets[wallet]) {
            registeredWallets[wallet] = true;
            walletList.push(wallet);
            emit WalletRegistered(wallet);
        }
    }

    function getWalletList() external view returns (address[] memory) {
        return walletList;
    }
}
