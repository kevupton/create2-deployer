import {CREATE2_DEPLOYER_ADDRESS} from '../utils';
import {Create2Deployer__factory} from '../../typechain-types';
import {ethers, network} from 'hardhat';

(async () => {
  const [signer] = await ethers.getSigners();
  const create2DeployerFactory = new Create2Deployer__factory(signer);
  const create2Deployer = await create2DeployerFactory.deploy();
  const bytecode = await ethers.provider.getCode(create2Deployer.address);

  await network.provider.send('hardhat_setCode', [
    CREATE2_DEPLOYER_ADDRESS,
    bytecode,
  ]);
})();
