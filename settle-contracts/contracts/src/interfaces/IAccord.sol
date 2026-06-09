// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IAccord
/// @notice Shared Somnia Accord platform types
/// @dev These MUST match the platform exactly — do not modify

interface IAccord {

    enum ConsensusType { Majority, Threshold }

    enum ResponseStatus {
        None,       // 0
        Pending,    // 1
        Success,    // 2
        Failed,     // 3
        TimedOut    // 4
    }

    struct Response {
        address validator;
        bytes   result;
        ResponseStatus status;
        uint256 receipt;
        uint256 timestamp;
        uint256 executionCost;
    }

    struct Request {
        uint256 id;
        address requester;
        address callbackAddress;
        bytes4  callbackSelector;
        address[] subcommittee;
        Response[] responses;
        uint256 responseCount;
        uint256 failureCount;
        uint256 threshold;
        uint256 createdAt;
        uint256 deadline;
        ResponseStatus status;
        ConsensusType consensusType;
        uint256 remainingBudget;
        uint256 perAgentBudget;
    }
}

interface IAccordPlatform is IAccord {
    function createRequest(
        uint256 agentId,
        address callbackAddress,
        bytes4  callbackSelector,
        bytes   calldata payload
    ) external payable returns (uint256 requestId);

    function getRequestDeposit() external view returns (uint256);
}

interface IAccordAgent {
    function inferString(
        string memory prompt,
        string memory system,
        bool chainOfThought,
        string[] memory allowedValues
    ) external returns (string memory);

    function inferNumber(
        string memory prompt,
        string memory system,
        int256 minValue,
        int256 maxValue,
        bool chainOfThought
    ) external returns (int256);
}
