import {subtask, task} from 'hardhat/config';
import {
  TASK_COMPILE,
  TASK_COMPILE_SOLIDITY_READ_FILE,
  TASK_TEST_SETUP_TEST_ENVIRONMENT,
} from 'hardhat/builtin-tasks/task-names';
import {camel} from 'case';
import {getAddress, hexConcat, keccak256} from 'ethers/lib/utils';
import * as fs from 'fs';
import {run} from 'hardhat';
import {Create2Deployer__factory} from '../../typechain-types';
import {CREATE2_DEPLOYER_ADDRESS, Deployer} from '../deployer';

let contracts: Record<string, string> = {};

const TASK_LOAD_CONTRACTS = 'environment:load';
const TASK_SAVE_CONTRACTS = 'environment:save';
const TASK_COMPUTE_HASH = 'environment:hash';

task(TASK_COMPILE).setAction(async (taskArgs, hre, runSuper) => {
  contracts = await run(TASK_LOAD_CONTRACTS, {
    path: hre.config.environment.outputPath,
  });

  let currentHash: string = await run(TASK_COMPUTE_HASH, {contracts});
  const prevHash: string = currentHash;
  let result: unknown;

  do {
    console.log('Compiling with Create2 Variables');
    result = await runSuper(taskArgs);

    hre.environment.reload();
    contracts = await hre.environment.addresses;
    currentHash = await run(TASK_COMPUTE_HASH, {contracts});

    console.log(currentHash, prevHash);
  } while (currentHash !== prevHash);

  await run(TASK_SAVE_CONTRACTS, {
    contracts,
    path: hre.config.environment.outputPath,
  });

  return result;
});

const ADDRESS_ZERO = '0x0000000000000000000000000000000000000000';
subtask(TASK_COMPILE_SOLIDITY_READ_FILE).setAction(
  async (taskArgs, hre, runSuper): Promise<string> => {
    let result = await runSuper(taskArgs);
    const absolutePath: string = taskArgs.absolutePath;

    const config = hre.config.environment.variableMapping[absolutePath];
    if (config) {
      const regex = new RegExp(
        `(${config.variable}\\s*=\\s*(?:[a-zA-Z_][a-zA-Z_0-9]*\\()?)${ADDRESS_ZERO}((?:\\))?\\s*;)`,
        'g'
      );
      const address = getAddress(contracts[camel(config.variable)]);
      if (address) result = result.replace(regex, '$1' + address + '$2');
    }

    return result;
  }
);

subtask(
  TASK_LOAD_CONTRACTS,
  'Loads the contract addresses from file'
).setAction(({path}) => {
  try {
    const file = fs.readFileSync(path, 'utf8');
    return JSON.parse(file);
  } catch (e) {
    return {};
  }
});

subtask(TASK_SAVE_CONTRACTS, 'Saves the contract addresses to file').setAction(
  async ({contracts, path}) => {
    fs.writeFileSync(path, JSON.stringify(contracts));
  }
);

subtask(
  TASK_COMPUTE_HASH,
  'Creates a hash based on the contract addresses given'
).setAction(async ({contracts}, env) => {
  return keccak256(
    hexConcat(
      env.config.environment.variables
        .map(val => {
          return camel(val.targetContract);
        })
        .map(id => contracts[id])
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

    await deployer.templates.placeholder();

    console.log('Create2 Deployer Setup');
  }
);
