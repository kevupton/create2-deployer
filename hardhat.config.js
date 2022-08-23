"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
require("@nomicfoundation/hardhat-toolbox");
require("@typechain/hardhat");
require("hardhat-package");
var _a = process.env, PRIVATE_KEY = _a.PRIVATE_KEY, INFURA_API_KEY = _a.INFURA_API_KEY, ETHERSCAN_API_KEY = _a.ETHERSCAN_API_KEY;
var accounts = PRIVATE_KEY ? [PRIVATE_KEY] : [];
var config = {
    solidity: '0.8.9',
    typechain: {
        target: 'ethers-v5',
    },
    package: {
        copy: [
            { src: 'src/utils', dest: 'utils', exported: true },
            { src: 'src/testing', dest: 'testing' },
        ],
    },
    networks: {
        rinkeby: {
            url: "https://rinkeby.infura.io/v3/".concat(INFURA_API_KEY),
            accounts: accounts,
        },
        mainnet: {
            url: "https://mainnet.infura.io/v3/".concat(INFURA_API_KEY),
            accounts: accounts,
        },
        goerli: {
            url: "https://goerli.infura.io/v3/".concat(INFURA_API_KEY),
            accounts: accounts,
        },
    },
    etherscan: {
        apiKey: ETHERSCAN_API_KEY,
    },
};
exports.default = config;
