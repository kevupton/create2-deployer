import {Deployer} from '../utils';
import {
  DeploymentRegistry,
  DeploymentRegistry__factory,
} from '../../typechain-types';
import {BytesLike, Contract} from 'ethers';
import {keccak256, toUtf8Bytes} from 'ethers/lib/utils';
import {wait} from '../utils/wait';

export class Registry {
  private pendingCalls: BytesLike[] = [];
  private pendingDeployments: Record<
    string,
    DeploymentRegistry.DeploymentInfoStruct
  > = {};

  private constructor(public readonly contract: DeploymentRegistry) {}

  static async from(deployer: Deployer | Promise<Deployer>) {
    deployer = await deployer;
    const registry = await deployer.deploy(
      new DeploymentRegistry__factory(deployer.signer)
    );
    await registry.deployed();
    return new Registry(registry);
  }

  async sync() {
    const calls = this.pendingCalls;
    this.pendingCalls = [];

    Object.entries(this.pendingDeployments).forEach(([key, value]) => {
      calls.push(
        this.contract.interface.encodeFunctionData('register', [key, value])
      );
    });

    if (this.pendingCalls.length) {
      try {
        await this.contract.multicall(calls).then(wait);
      } catch (e) {
        console.error('registry multicall failed', e);
      }
    }
  }

  async deploymentInfo<T extends Record<string, string>>(suite: T) {
    const registry = await this.contract;
    const keys: Record<string, keyof T> = {};
    const calls: string[] = Object.entries(suite).map(([key, address], i) => {
      keys[i] = key;
      return registry.interface.encodeFunctionData('deploymentInfo', [address]);
    });
    const infos = await registry.callStatic.multicall(calls);
    return infos.reduce((results, result, i) => {
      const decoded = registry.interface.decodeFunctionResult(
        'deploymentInfo',
        result
      ) as unknown as DeploymentRegistry.DeploymentInfoStruct;
      results[keys[i]] = {
        owner: decoded.owner,
        initialized: decoded.initialized,
        hash: decoded.hash,
        block: decoded.block,
        timestamp: decoded.timestamp,
        lastConfigureOptions: decoded.lastConfigureOptions,
        constructOptions: decoded.constructOptions,
        initializeOptions: decoded.initializeOptions,
      };
      return results;
    }, {} as Record<keyof T, DeploymentRegistry.DeploymentInfoStruct>);
  }

  async registerOptions(options: object) {
    const registry = await this.contract;

    const bytes = toUtf8Bytes(JSON.stringify(options));
    const id = keccak256(bytes);

    try {
      await registry.submitOptions(bytes).then(wait);
      console.log('submitted options');
    } catch (e) {
      console.log('options already submitted');
    }

    return id;
  }

  async registerOptionsBulk(...options: object[]) {
    const registry = await this.contract;
    const optionIds: string[] = [];
    const calls: string[] = [];

    const bytesArray = options.map(option =>
      toUtf8Bytes(JSON.stringify(option))
    );
    const ids = bytesArray.map(bytes => keccak256(bytes));

    const checks = await Promise.all(
      ids.map(async id => {
        return registry.options(id).catch(() => undefined);
      })
    );

    for (const i in bytesArray) {
      const bytes = bytesArray[i];
      const id = ids[i];

      if (!checks[i]) {
        optionIds.push(id);
        calls.push(
          registry.interface.encodeFunctionData('submitOptions', [bytes])
        );
      }
    }

    await registry.multicall(calls);

    return optionIds;
  }

  setInitialized(address: string, optionsId: BytesLike) {
    if (this.pendingDeployments[address]) {
      this.pendingDeployments[address].initialized = true;
      this.pendingDeployments[address].initializeOptions = optionsId;
    } else {
      this.pendingCalls.push(
        this.contract.interface.encodeFunctionData('initialized', [
          address,
          optionsId,
        ])
      );
    }
  }

  setConfigured(address: string, optionsId: BytesLike) {
    if (this.pendingDeployments[address]) {
      this.pendingDeployments[address].lastConfigureOptions = optionsId;
    } else {
      this.pendingCalls.push(
        this.contract.interface.encodeFunctionData('configured', [
          address,
          optionsId,
        ])
      );
    }
  }

  async setDeploymentInfo(contract: Contract, optionsId: BytesLike) {
    if (!contract.deployTransaction) {
      return;
    }

    const tx = await this.contract.provider.getTransaction(
      contract.deployTransaction.hash
    );

    if (!tx.blockNumber) {
      throw new Error('missing block number from deploy transaction');
    }

    const block = await this.contract.provider.getBlock(tx.blockNumber);

    this.pendingDeployments[contract.address] = {
      hash: contract.deployTransaction.hash,
      block: block.number,
      timestamp: block.timestamp,
      owner: await this.contract.signer.getAddress(),
      constructOptions: optionsId,
      initializeOptions: '0x',
      initialized: false,
      lastConfigureOptions: '0x',
    };
  }
}
