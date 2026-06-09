// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Somnia Foundation
// Adapted from @somnia-chain/reactivity-contracts
// Modified: pragma updated to ^0.8.24 for compatibility
pragma solidity ^0.8.24;

import {ISomniaEventHandler} from "./ISomniaEventHandler.sol";
import {SomniaExtensions} from "./SomniaExtensions.sol";
import {IERC165} from "./IERC165.sol";

abstract contract SomniaEventHandler is IERC165, ISomniaEventHandler {
    error OnlyReactivityPrecompile();

    function onEvent(
        address emitter,
        bytes32[] calldata eventTopics,
        bytes calldata data
    ) external override {
        if (msg.sender != SomniaExtensions.SOMNIA_REACTIVITY_PRECOMPILE_ADDRESS) {
            revert OnlyReactivityPrecompile();
        }
        _onEvent(emitter, eventTopics, data);
    }

    function supportsInterface(bytes4 interfaceId)
        external
        pure
        override
        returns (bool)
    {
        return type(IERC165).interfaceId == interfaceId
            || type(ISomniaEventHandler).interfaceId == interfaceId;
    }

    function _onEvent(
        address emitter,
        bytes32[] calldata eventTopics,
        bytes calldata data
    ) internal virtual;
}