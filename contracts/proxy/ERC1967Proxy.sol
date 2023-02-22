// SPDX-License-Identifier: MIT

pragma solidity ^0.8.18;

import "@openzeppelin/contracts/proxy/utils/Initializable.sol";

import { ERC1967Proxy as OzProxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import {PLACEHOLDER_ADDRESS} from "../constants.sol";

contract ERC1967Proxy is OzProxy, Initializable {

    constructor() OzProxy(PLACEHOLDER_ADDRESS, "") {}

    function initialize(
        address _logic,
        bytes memory _data
    ) external initializer {
        _upgradeToAndCall(_logic, _data, false);
    }
}
