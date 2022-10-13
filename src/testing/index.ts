import {CREATE2_DEPLOYER_ADDRESS, Deployer} from '../deployer';
import {Create2Deployer__factory} from '../../typechain-types';
import {task} from 'hardhat/config';
import {TASK_TEST_SETUP_TEST_ENVIRONMENT} from 'hardhat/builtin-tasks/task-names';

task(TASK_TEST_SETUP_TEST_ENVIRONMENT).setAction(
  async (opts, hre, runSuper) => {
    await runSuper();

    const [signer] = await hre.ethers.getSigners();
    const create2DeployerFactory = new Create2Deployer__factory(signer);
    const create2Deployer = await create2DeployerFactory.deploy();
    const bytecode = await hre.ethers.provider.getCode(create2Deployer.address);

    await hre.network.provider.send('hardhat_setCode', [
      CREATE2_DEPLOYER_ADDRESS,
      bytecode,
    ]);

    const deployer = new Deployer(signer);

    await deployer.templates.placeholder();

    console.log('Create2 Deployer Setup');
  }
);
