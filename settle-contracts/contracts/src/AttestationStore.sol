// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

/// @title AttestationStore
/// @notice Permanent onchain receipts for every Settle deposit and rebalance.
///         Write-once. Never updated or deleted.
///         Vault calls logReceipt() and logRebalance() after finalisation.
contract AttestationStore is Ownable {

    // ── Structs ────────────────────────────────────────────────────────────

    struct DepositReceipt {
        address wallet;
        uint256 amount;
        uint8   poolId;
        string  poolName;
        string  intentText;
        uint256 timestamp;
        uint256 loggedAt;
    }

    struct RebalanceReceipt {
        address wallet;
        uint8   fromPoolId;
        uint8   toPoolId;
        uint256 oldAPY;
        uint256 newAPY;
        uint256 timestamp;
    }

    // ── State ──────────────────────────────────────────────────────────────

    address public vault;

    // wallet => deposit receipts
    mapping(address => DepositReceipt[]) public deposits;

    // wallet => rebalance receipts
    mapping(address => RebalanceReceipt[]) public rebalances;

    uint256 public totalDeposits;
    uint256 public totalRebalances;

    // ── Events ─────────────────────────────────────────────────────────────

    event ReceiptLogged(
        address indexed wallet,
        uint256 amount,
        uint8   poolId,
        string  poolName,
        uint256 timestamp
    );

    event RebalanceLogged(
        address indexed wallet,
        uint8   fromPoolId,
        uint8   toPoolId,
        uint256 oldAPY,
        uint256 newAPY,
        uint256 timestamp
    );

    // ── Errors ─────────────────────────────────────────────────────────────

    error OnlyVault();
    error ZeroAddress();
    error VaultAlreadySet();

    // ── Modifier ───────────────────────────────────────────────────────────

    modifier onlyVault() {
        if (msg.sender != vault) revert OnlyVault();
        _;
    }

    // ── Constructor ────────────────────────────────────────────────────────

    constructor() Ownable(msg.sender) {}

    // ── Setup ──────────────────────────────────────────────────────────────

    function setVault(address _vault) external onlyOwner {
        if (_vault == address(0)) revert ZeroAddress();
        if (vault != address(0)) revert VaultAlreadySet();
        vault = _vault;
    }

    // ── Write ──────────────────────────────────────────────────────────────

    function logReceipt(
        address wallet,
        uint256 amount,
        uint8   poolId,
        string  calldata poolName,
        string  calldata intentText,
        uint256 timestamp
    ) external onlyVault {
        deposits[wallet].push(DepositReceipt({
            wallet:     wallet,
            amount:     amount,
            poolId:     poolId,
            poolName:   poolName,
            intentText: intentText,
            timestamp:  timestamp,
            loggedAt:   block.timestamp
        }));

        totalDeposits++;

        emit ReceiptLogged(wallet, amount, poolId, poolName, timestamp);
    }

    function logRebalance(
        address wallet,
        uint8   fromPoolId,
        uint8   toPoolId,
        uint256 oldAPY,
        uint256 newAPY,
        uint256 timestamp
    ) external onlyVault {
        rebalances[wallet].push(RebalanceReceipt({
            wallet:     wallet,
            fromPoolId: fromPoolId,
            toPoolId:   toPoolId,
            oldAPY:     oldAPY,
            newAPY:     newAPY,
            timestamp:  timestamp
        }));

        totalRebalances++;

        emit RebalanceLogged(wallet, fromPoolId, toPoolId, oldAPY, newAPY, timestamp);
    }

    // ── Read ───────────────────────────────────────────────────────────────

    function getDeposits(address wallet)
        external view returns (DepositReceipt[] memory)
    {
        return deposits[wallet];
    }

    function getRebalances(address wallet)
        external view returns (RebalanceReceipt[] memory)
    {
        return rebalances[wallet];
    }

    function getDepositCount(address wallet) external view returns (uint256) {
        return deposits[wallet].length;
    }

    function getRebalanceCount(address wallet) external view returns (uint256) {
        return rebalances[wallet].length;
    }
}
