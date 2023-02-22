// SPDX-License-Identifier: MIT

pragma solidity ^0.8.18;

import "@openzeppelin/contracts/proxy/utils/Initializable.sol";

import { TransparentUpgradeableProxy as OzTUProxy } from "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";

import {PLACEHOLDER_ADDRESS} from "../constants.sol";

contract TransparentUpgradeableProxy is OzTUProxy, Initializable {

    constructor() OzTUProxy(PLACEHOLDER_ADDRESS, PLACEHOLDER_ADDRESS, "") {}

    function initialize(
        address _logic,
        address admin_,
        bytes memory _data
    ) external initializer {
        _upgradeToAndCall(_logic, _data, false);
        _changeAdmin(admin_);
    }
}
