// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Somnia Foundation
// Adapted from @somnia-chain/reactivity-contracts
// Modified: pragma updated to ^0.8.24 for compatibility
pragma solidity ^0.8.24;

interface ISomniaEventHandler {
    function onEvent(
        address emitter,
        bytes32[] calldata eventTopics,
        bytes calldata data
    ) external;
}