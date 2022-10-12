// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import "@openzeppelin/contracts/utils/Multicall.sol";

contract DeploymentRegistry is Multicall {

    event OptionsSubmitted(bytes32 indexed id);
    event Registered(address indexed target, DeploymentInfo info, address indexed sender);
    event Initialized(address indexed target, bytes32 options);
    event Configured(address indexed target, bytes32 options);
    event TransferredOwnership(address indexed target, address indexed newOwner);

    struct DeploymentInfo {
        bool initialized;
        uint64 block;
        uint64 timestamp;
        address owner;
        bytes32 hash;
        bytes32 lastConfigureOptions;
        bytes32 constructOptions;
        bytes32 initializeOptions;
    }

    mapping(bytes32 => bytes) public options;
    mapping(address => DeploymentInfo) public deploymentInfo;

    modifier onlyOwner(address target) {
        require(msg.sender == deploymentInfo[target].owner, 'DeploymentRegistry: NOT_OWNER');
        _;
    }

    function register(address target, DeploymentInfo calldata info) external {
        require(options[info.constructOptions].length > 0, 'DeploymentRegistry: INVALID_CONSTRUCT_OPTIONS');
        require(!info.initialized || options[info.initializeOptions].length > 0, 'DeploymentRegistry: INVALID_INITIALIZE_OPTIONS');
        require(info.hash != bytes32(0), 'DeploymentRegistry: INVALID_HASH');
        require(info.block > 0, 'DeploymentRegistry: INVALID_BLOCK');
        require(info.timestamp > 0, 'DeploymentRegistry: INVALID_TIMESTAMP');
        require(info.owner != address(0), 'DeploymentRegistry: INVALID_OWNER');
        require(deploymentInfo[target].hash == 0, 'DeploymentRegistry: ALREADY_REGISTERED');

        deploymentInfo[target] = info;
        emit Registered(target, info, msg.sender);

        if (info.initialized) emit Initialized(target, info.initializeOptions);
        if (info.lastConfigureOptions != 0) emit Configured(target, info.lastConfigureOptions);
        emit TransferredOwnership(target, info.owner);
    }

    function submitOptions(bytes calldata currentOptions) external returns (bytes32 id) {
        id = keccak256(currentOptions);
        require(options[id].length == 0, 'DeploymentRegistry: OPTIONS_EXIST');
        options[id] = currentOptions;
        emit OptionsSubmitted(id);
    }

    function initialized(address target, bytes32 optionsId) external onlyOwner(target) {
        require(options[optionsId].length > 0, 'DeploymentRegistry: INVALID_INITIALIZE_OPTIONS');
        DeploymentInfo storage info = deploymentInfo[target];

        require(!info.initialized, 'DeploymentRegistry: ALREADY_INITIALIZED');
        info.initializeOptions = optionsId;
        info.initialized = true;

        emit Initialized(target, optionsId);
    }

    function configured(address target, bytes32 optionsId) external onlyOwner(target) {
        require(options[optionsId].length > 0, 'DeploymentRegistry: INVALID_CONFIGURATION_OPTIONS');
        deploymentInfo[target].lastConfigureOptions = optionsId;
        emit Configured(target, optionsId);
    }

    function transferOwnership(address target, address newOwner) external onlyOwner(target) {
        require(newOwner != address(0), 'DeploymentRegistry: INVALID_OWNER');
        deploymentInfo[target].owner = newOwner;
        emit TransferredOwnership(target, newOwner);
    }
}
