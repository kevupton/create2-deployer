import {subtask, task} from 'hardhat/config';
import {
  TASK_COMPILE,
  TASK_COMPILE_SOLIDITY_READ_FILE,
  TASK_TEST_SETUP_TEST_ENVIRONMENT,
} from 'hardhat/builtin-tasks/task-names';
import {getAddress, hexConcat, keccak256} from 'ethers/lib/utils';
import * as fs from 'fs';
import {
  Create2Deployer__factory,
  DeploymentRegistry__factory,
  Placeholder__factory,
} from '../../typechain-types';
import {CREATE2_DEPLOYER_ADDRESS, Deployer} from '../deployer';
import {debug} from '../utils';
import {deployTemplates} from '../deployer/templates/deploy-templates';
import {BeaconProxy__factory} from '../../typechain-types/factories/contracts/proxy';

let contracts: Record<string, string> = {};

const TASK_LOAD_CONTRACTS = 'environment:load';
const TASK_SAVE_CONTRACTS = 'environment:save';
const TASK_COMPUTE_HASH = 'environment:hash';

task(TASK_COMPILE).setAction(async (taskArgs, hre, runSuper) => {
  contracts = await hre.run(TASK_LOAD_CONTRACTS, {
    path: hre.config.environment.outputPath,
  });

  let currentHash: string = await hre.run(TASK_COMPUTE_HASH, {contracts});
  let prevHash: string;
  let result: unknown;

  do {
    console.log('Compiling with Create2 Variables');
    result = await runSuper(taskArgs);

    hre.environment.reload();
    contracts = await hre.environment.addresses;
    prevHash = currentHash;
    currentHash = await hre.run(TASK_COMPUTE_HASH, {contracts});
  } while (currentHash !== prevHash);

  await hre.run(TASK_SAVE_CONTRACTS, {
    contracts,
    path: hre.config.environment.outputPath,
  });

  return result;
});

subtask(TASK_COMPILE_SOLIDITY_READ_FILE).setAction(
  async (taskArgs, hre, runSuper): Promise<string> => {
    let result = await runSuper(taskArgs);
    const absolutePath: string = taskArgs.absolutePath;

    const config = hre.config.environment.variableMapping[absolutePath];
    if (config && !contracts[config.id]) {
      debug('cannot find id in contracts. id: ', config.id);
    }
    if (config && contracts[config.id]) {
      const regex = new RegExp(
        `(${config.variable}\\s*=\\s*(?:[a-zA-Z_][a-zA-Z_0-9]*\\()?)0x[0-9a-fA-F]{0,64}((?:\\))?\\s*;)`,
        'g'
      );
      const address = getAddress(contracts[config.id]);
      if (!regex.test(result)) {
        throw new Error(
          'Cannot find variable named "' +
            config.variable +
            '" inside "' +
            absolutePath +
            '"'
        );
      }
      result = result.replace(regex, '$1' + address + '$2');
      if (hre.config.environment.writeToFile) {
        fs.writeFileSync(absolutePath, result);
      }
    }

    return result;
  }
);

subtask(
  TASK_LOAD_CONTRACTS,
  'Loads the contract addresses from file'
).setAction(({path}) => {
  try {
    return JSON.parse(fs.readFileSync(path, 'utf8'));
  } catch (e) {
    return {};
  }
});

subtask(TASK_SAVE_CONTRACTS, 'Saves the contract addresses to file').setAction(
  async ({contracts, path}) => {
    fs.writeFileSync(path, JSON.stringify(contracts, undefined, 4));
  }
);

subtask(
  TASK_COMPUTE_HASH,
  'Creates a hash based on the contract addresses given'
).setAction(async ({contracts}, env) => {
  return keccak256(
    hexConcat(
      env.config.environment.variables.map(val => {
        return contracts[val.id] || '0x';
      })
    )
  );
});

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

    console.log('beacon proxy');
    const factory = new BeaconProxy__factory(signer);
    await factory.deploy();
    console.log('deployed');

    const deploymentRegistry = await deployer.deploy(
      new DeploymentRegistry__factory(),
      {salt: 0}
    );
    await deploymentRegistry.deployed();

    const placeholder = await deployer.deploy(new Placeholder__factory(), {
      salt: 0,
    });
    await placeholder.deployed();

    await deployTemplates(deployer);

    console.log('Create2 Deployer Setup');
  }
);
