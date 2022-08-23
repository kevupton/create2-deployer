// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import "@openzeppelin/contracts/utils/Address.sol";

contract Create2Deployer {
    using Address for address;

    mapping(bytes32 => bytes) public template;

    function deployAddress(bytes memory bytecode, uint256 salt) public view returns (address addr) {
        bytes32 hash = keccak256(
            abi.encodePacked(bytes1(0xff), address(this), salt, keccak256(bytecode))
        );
        return address(uint160(uint256(hash)));
    }

    function deploy(bytes memory bytecode, uint256 salt) public returns (address addr) {
        assembly {
            addr := create2(0, add(bytecode, 0x20), mload(bytecode), salt)
            if iszero(extcodesize(addr)) {
                revert(0, 0)
            }
        }
    }

    function deployTemplate(bytes32 _templateId, uint256 salt) external returns (address) {
        bytes memory _template = template[_templateId];
        require(_template.length > 0, 'INVALID_TEMPLATE');
        return deploy(_template, salt);
    }

    function templateId(bytes calldata bytecode) public pure returns (bytes32) {
        return keccak256(bytecode);
    }

    function createTemplate(bytes calldata bytecode) external returns (bytes32 _templateId) {
        _templateId = templateId(bytecode);
        template[_templateId] = bytecode;
    }
}
