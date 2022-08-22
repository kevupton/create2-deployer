// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import "@openzeppelin/contracts/utils/Address.sol";
import "./ICreate2Deployer.sol";

contract Create2Deployer is ICreate2Deployer {
    using Address for address;

    function predictDeployAddress(bytes memory bytecode, uint256 salt) external view returns (address addr) {
        bytes32 hash = keccak256(
            abi.encodePacked(bytes1(0xff), address(this), salt, keccak256(bytecode))
        );
        return address(uint160(uint256(hash)));
    }

    function deploy(bytes memory bytecode, uint256 salt) external returns (address addr) {
        return deployAndCall(bytecode, salt, new bytes[](0));
    }

    function deployAndCall(bytes memory bytecode, uint256 salt, bytes[] memory calls) public returns (address addr) {
        assembly {
            addr := create2(0, add(bytecode, 0x20), mload(bytecode), salt)
            if iszero(extcodesize(addr)) {
                revert(0, 0)
            }
        }

        for (uint i = 0; i < calls.length; i++) {
            addr.functionCall(calls[i]);
        }

        emit Deployed(addr, salt, calls);
    }
}
