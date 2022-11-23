// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import 'forge-std/Test.sol';

import '../../contracts/Create2Deployer.sol';

// Create2Deployer foundry contract
// USAGE: contract TestContract is Deployer(0x... , 0)
contract Deployer is Test {
    address deployer = 0x07C25C3fcFb51B24Cf325769Ea2E381A309930E2;
    uint256 salt;
    Create2Deployer create2Deployer;

    constructor(address deployerAddress, uint256 defaultSalt) {
        if (deployerAddress != address(0)) {
            setDeployer(deployerAddress);
        }

        salt = defaultSalt;
    }

    function setup() public {
        Create2Deployer create2Instance = new Create2Deployer();

        bytes memory code = address(create2Instance).code;

        vm.etch(deployer, code);

        create2Deployer = Create2Deployer(deployer);
    }

    function setDeployer(address deployerAddress) public {
        deployer = deployerAddress;
    }

    function deploy(
        bytes memory bytecode,
        Create2Deployer.FunctionCall[] calldata calls
    ) public returns (address addr) {
        return create2Deployer.deploy(bytecode, salt, calls);
    }

    function clone(address target) public returns (address addr) {
        return create2Deployer.clone(target, salt);
    }
}
