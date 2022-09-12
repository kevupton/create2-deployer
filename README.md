# Create 2 Deployer

## Deployed Locations

| Network | Deployment                                                                                                                    |
|---------|-------------------------------------------------------------------------------------------------------------------------------|
| Rinkeby | [0x07C25C3fcFb51B24Cf325769Ea2E381A309930E2](https://rinkeby.etherscan.io/address/0x07C25C3fcFb51B24Cf325769Ea2E381A309930E2) |
| Goerli  | [0x07C25C3fcFb51B24Cf325769Ea2E381A309930E2](https://goerli.etherscan.io/address/0x07C25C3fcFb51B24Cf325769Ea2E381A309930E2)  |

## Installation

```bash
yarn add -D create2-deployer
```

## Usage

```ts
import {Deployer} from 'create2-deployer';

const signer = await ethers.getSigner(address);
const deployer = new Deployer(signer);
```

## Test Environment

Add to `hardhat.config.ts`
```ts
import 'create2-deployer/testing';
```
