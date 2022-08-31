import {CREATE2_DEPLOYER_ADDRESS} from '../utils';
import {Create2Deployer__factory} from '../../typechain-types';
import {ethers, network} from 'hardhat';
import {task} from 'hardhat/config';
import {TASK_TEST_SETUP_TEST_ENVIRONMENT} from 'hardhat/builtin-tasks/task-names';

task(TASK_TEST_SETUP_TEST_ENVIRONMENT).setAction(
  async (opts, hre, runSuper) => {
    await runSuper();

    const [signer] = await ethers.getSigners();
    const create2DeployerFactory = new Create2Deployer__factory(signer);
    const create2Deployer = await create2DeployerFactory.deploy();
    const bytecode = await ethers.provider.getCode(create2Deployer.address);

    await network.provider.send('hardhat_setCode', [
      CREATE2_DEPLOYER_ADDRESS,
      bytecode,
    ]);
  }
);
