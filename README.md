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


Example `.env`
```dotenv
# used in the network url
INFURA_API_KEY=

# the api key to verify smart contracts using
ETHERSCAN_API_KEY=

# all of the private keys used (mainly just deployer for now)
PRIVATE_KEY=

CONFIRMATIONS=6
GAS_PRICE_MULTIPLIER=1.5
CREATE2_DEBUG=true
```
