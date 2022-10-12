// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import "@openzeppelin/contracts/utils/Multicall.sol";

contract DeploymentRegistry is Multicall {

    event OptionsSubmitted(bytes32 indexed id);
    event Registered(uint256 indexed network, address indexed target, DeploymentInfo info, address indexed sender);
    event Initialized(uint256 indexed network, address indexed target, bytes32 options);
    event Configured(uint256 indexed network, address indexed target, bytes32 options);
    event TransferredOwnership(uint256 indexed network, address indexed target, address indexed newOwner);

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
    mapping(uint256 => mapping(address => DeploymentInfo)) public deploymentInfo;

    modifier onlyOwner(uint256 network, address target) {
        require(msg.sender == deploymentInfo[network][target].owner, 'DeploymentRegistry: NOT_OWNER');
        _;
    }

    function register(uint256 network, address target, DeploymentInfo calldata info) external {
        require(options[info.constructOptions].length > 0, 'DeploymentRegistry: INVALID_CONSTRUCT_OPTIONS');
        require(!info.initialized || options[info.initializeOptions].length > 0, 'DeploymentRegistry: INVALID_INITIALIZE_OPTIONS');
        require(info.hash != bytes32(0), 'DeploymentRegistry: INVALID_HASH');
        require(info.block > 0, 'DeploymentRegistry: INVALID_BLOCK');
        require(info.timestamp > 0, 'DeploymentRegistry: INVALID_TIMESTAMP');
        require(info.owner != address(0), 'DeploymentRegistry: INVALID_OWNER');
        require(deploymentInfo[network][target].hash == 0, 'DeploymentRegistry: ALREADY_REGISTERED');

        deploymentInfo[network][target] = info;
        emit Registered(network, target, info, msg.sender);

        if (info.initialized) emit Initialized(network, target, info.initializeOptions);
        if (info.lastConfigureOptions != 0) emit Configured(network, target, info.lastConfigureOptions);
        emit TransferredOwnership(network, target, info.owner);
    }

    function submitOptions(bytes calldata currentOptions) external returns (bytes32 id) {
        id = keccak256(currentOptions);
        require(options[id].length == 0, 'DeploymentRegistry: OPTIONS_EXIST');
        options[id] = currentOptions;
        emit OptionsSubmitted(id);
    }

    function initialized(uint256 network, address target, bytes32 optionsId) external onlyOwner(network, target) {
        require(options[optionsId].length > 0, 'DeploymentRegistry: INVALID_INITIALIZE_OPTIONS');
        DeploymentInfo storage info = deploymentInfo[network][target];

        require(!info.initialized, 'DeploymentRegistry: ALREADY_INITIALIZED');
        info.initializeOptions = optionsId;
        info.initialized = true;

        emit Initialized(network, target, optionsId);
    }

    function configured(uint256 network, address target, bytes32 optionsId) external onlyOwner(network, target) {
        require(options[optionsId].length > 0, 'DeploymentRegistry: INVALID_CONFIGURATION_OPTIONS');
        deploymentInfo[network][target].lastConfigureOptions = optionsId;
        emit Configured(network, target, optionsId);
    }

    function transferOwnership(uint256 network, address target, address newOwner) external onlyOwner(network, target) {
        require(newOwner != address(0), 'DeploymentRegistry: INVALID_OWNER');
        deploymentInfo[network][target].owner = newOwner;
        emit TransferredOwnership(network, target, newOwner);
    }
}
