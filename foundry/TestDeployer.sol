// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import 'forge-std/Test.sol';

import '../contracts/Create2Deployer.sol';

// Create2Deployer foundry contract
// USAGE: contract TestContract is Create2DeployerHelper(0x... , 0)
contract TestDeployer is Test {
    address internal constant CREATE2_DEPLOYER_ADDRESS = 0x07C25C3fcFb51B24Cf325769Ea2E381A309930E2;

    uint256 internal immutable defaultSalt;
    Create2Deployer internal immutable create2Deployer;

    constructor(uint256 _defaultSalt) {
        // setup the create2 deployer at a specific address
        Create2Deployer create2Instance = new Create2Deployer();
        bytes memory code = address(create2Instance).code;
        vm.etch(CREATE2_DEPLOYER_ADDRESS, code);
        create2Deployer = Create2Deployer(CREATE2_DEPLOYER_ADDRESS);

        defaultSalt = _defaultSalt;
    }

    function deploy(string memory name) internal returns (address addr) {
        return deploy(name, "", defaultSalt);
    }

    function deploy(
        string memory name,
        bytes memory args
    ) internal returns (address addr) {
        return deploy(name, args, defaultSalt);
    }

    function deploy(
        string memory name,
        bytes memory args,
        uint256 salt
    ) internal returns (address addr) {
        Create2Deployer.FunctionCall[] memory calls = new Create2Deployer.FunctionCall[](0);
        return deploy(name, args, salt, calls);
    }

    function deploy(
        string memory name,
        uint256 salt
    ) internal returns (address addr) {
        return deploy(name, "", salt);
    }

    function deploy(
        string memory name,
        bytes memory args,
        Create2Deployer.FunctionCall[] memory calls
    ) internal returns (address addr) {
        return deploy(name, args, defaultSalt, calls);
    }

    function deploy(
        string memory name,
        Create2Deployer.FunctionCall[] memory calls
    ) internal returns (address addr) {
        return deploy(name, "", calls);
    }

    function deploy(
        string memory name,
        uint256 salt,
        Create2Deployer.FunctionCall[] memory calls
    ) internal returns (address addr) {
        return deploy(name, "", salt, calls);
    }

    function deploy(
        string memory name,
        bytes memory args,
        uint256 salt,
        Create2Deployer.FunctionCall[] memory calls
    ) internal returns (address addr) {
        addr = factoryAddress(name, args, salt);
        if (addr.code.length == 0) {
            create2Deployer.deploy(_bytecode(name, args), salt, calls);
        }
    }

    function factoryAddress(string memory name) internal view returns (address addr) {
        return factoryAddress(name, "");
    }

    function factoryAddress(string memory name, bytes memory args) internal view returns (address addr) {
        return factoryAddress(name, args, defaultSalt);
    }

    function factoryAddress(string memory name, uint256 salt) internal view returns (address addr) {
        return factoryAddress(name, "", salt);
    }

    function factoryAddress(string memory name, bytes memory args, uint256 salt) internal view returns (address addr) {
        return deployAddress(_bytecode(name, args), salt);
    }

    function deployAddress(bytes memory bytecode) internal view returns (address addr) {
        return deployAddress(bytecode, defaultSalt);
    }

    function deployAddress(bytes memory bytecode) internal pure returns (address addr) {
        return deployAddress(bytecode, defaultSalt);
    }

    function deployAddress(bytes memory bytecode, uint256 salt) internal pure returns (address addr) {
        bytes32 hash = keccak256(
            abi.encodePacked(
                bytes1(0xff),
                CREATE2_DEPLOYER_ADDRESS,
                salt,
                keccak256(bytecode)
            )
        );

        // NOTE: cast last 20 bytes of hash to address
        return address(uint160(uint(hash)));
    }

    function _bytecode(string memory name, bytes memory args) private view returns (bytes memory) {
        return abi.encodePacked(vm.getCode(name), args);
    }
}
