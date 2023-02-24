// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/proxy/utils/Initializable.sol";

import { ProxyAdmin as OzProxyAdmin } from "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol";

import {PLACEHOLDER_ADDRESS} from "../constants.sol";

// an upgradeable beacon so that the contract code is the same on deployment and we just initialize it in the one go
contract ProxyAdmin is OzProxyAdmin, Initializable {

    constructor() OzProxyAdmin() {}

    function initialize(address owner_) external initializer {
        _transferOwnership(owner_);
    }
}
