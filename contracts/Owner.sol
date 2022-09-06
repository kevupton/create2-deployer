// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import "@openzeppelin/contracts/access/Ownable.sol";

contract Owner {

    function transferOwnership(Ownable target, address newOwner) external {
        target.transferOwnership(newOwner);
    }

    function revokeOwnership(Ownable target) external {
        target.renounceOwnership();
    }
}
