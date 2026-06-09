// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

/// @title APYFeed
/// @notice Stores pool APY rates onchain so SettleVault's LLM prompts
///         are deterministic across all validating nodes.
///         Every value the LLM reads must come from chain state —
///         never from an external API call.
contract APYFeed is Ownable {

    // ── Structs ───────────────────────────────────────────

    struct Pool {
        string  name;         // human-readable — passed into LLM prompt
        uint256 apy;          // basis points — 520 = 5.20%
        string  risk;         // "LOW" | "MED" | "HIGH" — passed into LLM prompt
        bool    active;       // inactive pools are excluded from LLM selection
        uint256 lastUpdated;  // block.timestamp of last rate update
    }

    // ── State ─────────────────────────────────────────────

    // poolId => Pool
    mapping(uint256 => Pool) public pools;

    // poolId => pool name string for LLM allowedValues array
    // kept separate so vault can build the constrained list cheaply
    string[] public poolNames;

    uint256 public poolCount;

    // ── Events ────────────────────────────────────────────

    /// @dev Reactive trigger subscribes to this event
    event APYUpdated(
        uint256 indexed poolId,
        string  indexed poolName,
        uint256 oldAPY,
        uint256 newAPY,
        uint256 timestamp
    );

    event PoolAdded(
        uint256 indexed poolId,
        string  name,
        uint256 apy,
        string  risk
    );

    event PoolStatusChanged(
        uint256 indexed poolId,
        bool active
    );

    // ── Errors ────────────────────────────────────────────

    error PoolNotFound(uint256 poolId);
    error PoolInactive(uint256 poolId);
    error InvalidAPY(uint256 apy);
    error InvalidRisk(string risk);
    error EmptyName();

    // ── Constructor ───────────────────────────────────────

    constructor() Ownable(msg.sender) {
        // Seed three pools on deployment
        // Vault reads these when building LLM prompts
        _addPool("SETTLE_POOL_A", 520, "LOW");   // 5.20%
        _addPool("SETTLE_POOL_B", 871, "MED");   // 8.71%
        _addPool("SETTLE_POOL_C", 1240, "HIGH"); // 12.40%
    }

    // ── Owner functions ───────────────────────────────────

    /// @notice Add a new yield pool
    function addPool(
        string calldata name,
        uint256 apy,
        string calldata risk
    ) external onlyOwner {
        _addPool(name, apy, risk);
    }

    /// @notice Update a pool's APY rate
    /// @dev Emits APYUpdated — reactive trigger subscribes to this
    function updateAPY(
        uint256 poolId,
        uint256 newAPY
    ) external onlyOwner {
        if (poolId >= poolCount) revert PoolNotFound(poolId);
        if (newAPY == 0 || newAPY > 10000) revert InvalidAPY(newAPY);

        Pool storage pool = pools[poolId];
        uint256 oldAPY = pool.apy;
        pool.apy = newAPY;
        pool.lastUpdated = block.timestamp;

        emit APYUpdated(
            poolId,
            pool.name,
            oldAPY,
            newAPY,
            block.timestamp
        );
    }

    /// @notice Activate or deactivate a pool
    function setPoolActive(
        uint256 poolId,
        bool active
    ) external onlyOwner {
        if (poolId >= poolCount) revert PoolNotFound(poolId);
        pools[poolId].active = active;
        emit PoolStatusChanged(poolId, active);
    }

    // ── View functions ────────────────────────────────────

    /// @notice Returns APY for a specific pool
    /// @dev Called by SettleVault when building LLM prompt
    function getAPY(uint256 poolId) external view returns (uint256) {
        if (poolId >= poolCount) revert PoolNotFound(poolId);
        return pools[poolId].apy;
    }

    /// @notice Returns full pool data
    function getPool(uint256 poolId) external view returns (Pool memory) {
        if (poolId >= poolCount) revert PoolNotFound(poolId);
        return pools[poolId];
    }

    /// @notice Returns all active pool names
    /// @dev Used by SettleVault to build the LLM allowedValues array
    ///      Must return only active pools — inactive ones removed
    ///      from LLM selection automatically
    function getActivePoolNames() external view returns (string[] memory) {
        // Count active pools first
        uint256 activeCount = 0;
        for (uint256 i = 0; i < poolCount; i++) {
            if (pools[i].active) activeCount++;
        }

        // Build active names array
        string[] memory names = new string[](activeCount);
        uint256 idx = 0;
        for (uint256 i = 0; i < poolCount; i++) {
            if (pools[i].active) {
                names[idx] = pools[i].name;
                idx++;
            }
        }
        return names;
    }

    /// @notice Builds the full prompt segment for LLM consumption
    /// @dev SettleVault calls this and concatenates with user data
    ///      Everything here is deterministic onchain state —
    ///      no external calls, no timestamps in the output
    function buildPoolPromptSegment() external view returns (string memory) {
        string memory segment = "Available yield pools: ";
        for (uint256 i = 0; i < poolCount; i++) {
            Pool memory pool = pools[i];
            if (!pool.active) continue;
            segment = string.concat(
                segment,
                pool.name,
                " (APY: ",
                _bpsToString(pool.apy),
                "%, Risk: ",
                pool.risk,
                ") "
            );
        }
        return segment;
    }

    // ── Internal ──────────────────────────────────────────

    function _addPool(
        string memory name,
        uint256 apy,
        string memory risk
    ) internal {
        if (bytes(name).length == 0) revert EmptyName();
        if (apy == 0 || apy > 10000) revert InvalidAPY(apy);

        uint256 poolId = poolCount;
        pools[poolId] = Pool({
            name:        name,
            apy:         apy,
            risk:        risk,
            active:      true,
            lastUpdated: block.timestamp
        });

        poolNames.push(name);
        poolCount++;

        emit PoolAdded(poolId, name, apy, risk);
    }

    /// @notice Converts basis points to decimal string
    /// @dev 520 → "5.20", 1240 → "12.40"
    ///      Used in LLM prompt construction — keeps prompts readable
    function _bpsToString(uint256 bps) internal pure returns (string memory) {
        uint256 whole = bps / 100;
        uint256 decimal = bps % 100;

        string memory decimalStr = decimal < 10
            ? string.concat("0", _toString(decimal))
            : _toString(decimal);

        return string.concat(_toString(whole), ".", decimalStr);
    }

    function _toString(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0";
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) { digits++; temp /= 10; }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits--;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
}