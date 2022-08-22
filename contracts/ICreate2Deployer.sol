// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

interface ICreate2Deployer {
    event Deployed(address addr, uint256 salt, bytes[] calls);

    function predictDeployAddress(bytes memory code, uint256 salt) external view returns (address addr);
    function deploy(bytes memory code, uint256 salt) external returns (address addr);
    function deployAndCall(bytes memory code, uint256 salt, bytes[] memory calls) external returns (address addr);
}
