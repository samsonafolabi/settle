// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IAPYFeed {
    struct Pool {
        string  name;
        uint256 apy;
        string  risk;
        bool    active;
        uint256 lastUpdated;
    }

    function getPool(uint256 poolId) external view returns (Pool memory);
    function getActivePoolNames() external view returns (string[] memory);
    function buildPoolPromptSegment() external view returns (string memory);
    function poolCount() external view returns (uint256);
    function getAPY(uint256 poolId) external view returns (uint256);
}

interface IAttestationStore {
    function logReceipt(
        address wallet,
        uint256 amount,
        uint8   poolId,
        string  calldata poolName,
        string  calldata intentText,
        uint256 timestamp
    ) external;

    function logRebalance(
        address wallet,
        uint8   fromPoolId,
        uint8   toPoolId,
        uint256 oldAPY,
        uint256 newAPY,
        uint256 timestamp
    ) external;
}

interface ISettleVault {
    struct UserPosition {
        uint256 balance;
        uint256 depositTime;
        uint256 accruedInterest;
        uint256 lastClaimTime;
        uint8   poolId;
        uint256 poolAPY;
        bool    active;
    }

    function rebalance(address wallet, uint8 newPoolId) external;
    function userAPYThreshold(address wallet) external view returns (uint256);
    function getPosition(address wallet) external view returns (UserPosition memory);
}
