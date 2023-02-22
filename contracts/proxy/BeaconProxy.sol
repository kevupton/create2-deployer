// SPDX-License-Identifier: MIT

pragma solidity ^0.8.18;


import "@openzeppelin/contracts/proxy/utils/Initializable.sol";

import { BeaconProxy as OzBeaconProxy } from "@openzeppelin/contracts/proxy/beacon/BeaconProxy.sol";

import {PLACEHOLDER_ADDRESS} from "../constants.sol";

// an upgradeable beacon so that the contract code is the same on deployment and we just initialize it in the one go
contract BeaconProxy is OzBeaconProxy, Initializable {

    constructor() OzBeaconProxy(PLACEHOLDER_ADDRESS, "") {}

    function initialize(address beacon_, bytes memory data) external initializer {
        _setBeacon(beacon_, data);
    }
}
