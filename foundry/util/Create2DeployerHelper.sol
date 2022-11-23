// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import 'forge-std/Test.sol';

import '../../contracts/Create2Deployer.sol';

// Create2Deployer foundry contract
// USAGE: contract TestContract is Create2DeployerHelper(0x... , 0)
contract Create2DeployerHelper is Test {
    address create2DeployerAddress = 0x07C25C3fcFb51B24Cf325769Ea2E381A309930E2;
    uint256 salt;
    Create2Deployer create2Deployer;

    constructor(address create2Address, uint256 defaultSalt) {
        if (create2Address != address(0)) {
            setCreate2DeployerAddress(create2Address);
        } else {
            setCreate2Deployer();
        }

        salt = defaultSalt;
    }

    function setCreate2DeployerAddress(address addr) public {
        create2DeployerAddress = addr;
        setCreate2Deployer();
    }

    function setCreate2Deployer() internal {
        Create2Deployer create2Instance = new Create2Deployer();

        bytes memory code = address(create2Instance).code;
        vm.etch(create2DeployerAddress, code);
        create2Deployer = Create2Deployer(create2DeployerAddress);
    }

    function deploy(
        bytes memory bytecode,
        Create2Deployer.FunctionCall[] memory calls
    ) public returns (address addr) {
        return create2Deployer.deploy(bytecode, salt, calls);
    }

    function clone(address target) public returns (address addr) {
        return create2Deployer.clone(target, salt);
    }
}
