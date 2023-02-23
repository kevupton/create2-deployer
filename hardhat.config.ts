import 'dotenv/config';
import {HardhatUserConfig} from 'hardhat/config';
import '@nomicfoundation/hardhat-toolbox';
import '@nomiclabs/hardhat-ethers';
import '@typechain/hardhat';
import 'hardhat-package';

const {PRIVATE_KEY, INFURA_API_KEY, ETHERSCAN_API_KEY} = process.env;

const accounts = PRIVATE_KEY ? [PRIVATE_KEY] : [];

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.18',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  typechain: {
    target: 'ethers-v5',
  },
  package: {
    copy: [
      {src: 'src/deployer', dest: 'deployer', exported: true},
      {src: 'src/utils', dest: 'utils', exported: true},
      {src: 'src/hardhat', dest: 'hardhat'},
      {src: 'foundry', dest: 'foundry'},
    ],
  },
  networks: {
    mainnet: {
      url: `https://mainnet.infura.io/v3/${INFURA_API_KEY}`,
      accounts,
    },
    goerli: {
      url: `https://goerli.infura.io/v3/${INFURA_API_KEY}`,
      accounts,
    },
  },
  etherscan: {
    apiKey: ETHERSCAN_API_KEY,
  },
};

export default config;
