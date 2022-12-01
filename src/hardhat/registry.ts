import {
  DeploymentRegistry,
  DeploymentRegistry__factory,
} from '../../typechain-types';
import {BigNumber, BytesLike, constants, Contract} from 'ethers';
import {hexDataLength, keccak256, toUtf8Bytes} from 'ethers/lib/utils';
import {debug, wait} from '../utils';
import {Deployer} from '../deployer';

export interface PendingCall {
  test: () => Promise<void>;
  call: BytesLike;
  context: any;
}

export interface DeploymentInfo {
  deployed: boolean;
  address: string;
  owner: string;
  initialized: boolean;
  hash: string;
  block: BigNumber;
  timestamp: BigNumber;
  lastConfigureSettings: string;
  constructSettings: string;
  initializeSettings: string;
}

export class Registry {
  private pendingCalls: PendingCall[] = [];
  private pendingDeployments: Record<
    string,
    DeploymentRegistry.DeploymentInfoStruct
  > = {};

  private constructor(public readonly contract: DeploymentRegistry) {}

  static async from(deployer: Deployer | Promise<Deployer>) {
    deployer = await deployer;
    const registry = await deployer.deploy(
      new DeploymentRegistry__factory(deployer.signer),
      {
        salt: 0,
      }
    );
    await registry.deployed();
    return new Registry(registry);
  }

  async sync() {
    const pendingCalls = this.pendingCalls;
    this.pendingCalls = [];

    Object.entries(this.pendingDeployments).forEach(([key, value]) => {
      pendingCalls.push({
        test: async () => this.contract.callStatic.register(key, value),
        call: this.contract.interface.encodeFunctionData('register', [
          key,
          value,
        ]),
        context: {
          call: 'register',
          args: [key, value],
        },
      });
    });

    const calls = (
      await Promise.all(
        pendingCalls.map(async ({test, call, context}) => {
          try {
            await test();
            return call;
          } catch (e) {
            console.warn('test failed', context, e);
            return undefined;
          }
        })
      )
    ).filter((value): value is string => value !== undefined);

    if (calls.length) {
      try {
        await this.contract.multicall(calls).then(wait);
      } catch (e) {
        console.warn('registry multicall failed', e);
      }
    }
  }

  async deploymentInfo<T extends Record<string, string>>(suite: T) {
    const registry = await this.contract;
    const keys: Record<string, {key: keyof T; address: string}> = {};
    const calls: string[] = Object.entries(suite).map(([key, address], i) => {
      keys[i] = {key, address};
      return registry.interface.encodeFunctionData('deploymentInfo', [address]);
    });
    const infos = await registry.callStatic.multicall(calls);
    const results = infos.reduce((results, result, i) => {
      const decoded = registry.interface.decodeFunctionResult(
        'deploymentInfo',
        result
      ) as unknown as DeploymentRegistry.DeploymentInfoStructOutput;
      results[keys[i].key] = {
        deployed: BigNumber.from(decoded.block).gt(0),
        address: keys[i].address,
        owner: decoded.owner,
        initialized: decoded.initialized,
        hash: decoded.hash,
        block: decoded.block,
        timestamp: decoded.timestamp,
        lastConfigureSettings: decoded.lastConfiguredSettings,
        constructSettings: decoded.constructSettings,
        initializeSettings: decoded.initializeSettings,
      } as DeploymentInfo;
      return results;
    }, {} as Record<keyof T, DeploymentInfo>);

    for (const result of Object.values(results)) {
      if (!result.deployed) {
        const code = await registry.provider.getCode(result.address);
        if (hexDataLength(code) > 0) {
          result.deployed = true;
        }
      }
    }

    return results;
  }

  async registerSettings(options: object) {
    const registry = await this.contract;

    const bytes = toUtf8Bytes(JSON.stringify(options));
    const id = keccak256(bytes);

    try {
      await registry.registerSettings(bytes).then(wait);
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
        return registry.settings(id).catch(() => undefined);
      })
    );

    for (const i in bytesArray) {
      const bytes = bytesArray[i];
      const id = ids[i];

      if (!checks[i]) {
        optionIds.push(id);
        calls.push(
          registry.interface.encodeFunctionData('registerSettings', [bytes])
        );
      }
    }

    await registry.multicall(calls);

    return optionIds;
  }

  setInitialized(address: string, optionsId: BytesLike) {
    debug('initialized', address, optionsId);
    if (this.pendingDeployments[address]) {
      this.pendingDeployments[address].initialized = true;
      this.pendingDeployments[address].initializeSettings = optionsId;
    } else {
      this.pendingCalls.push({
        test: () => this.contract.callStatic.initialized(address, optionsId),
        call: this.contract.interface.encodeFunctionData('initialized', [
          address,
          optionsId,
        ]),
        context: {
          call: 'initialized',
          args: [address, optionsId],
        },
      });
    }
  }

  setConfigured(address: string, optionsId: BytesLike) {
    debug('configured', address, optionsId);
    if (this.pendingDeployments[address]) {
      this.pendingDeployments[address].lastConfiguredSettings = optionsId;
    } else {
      this.pendingCalls.push({
        test: () => this.contract.callStatic.configured(address, optionsId),
        call: this.contract.interface.encodeFunctionData('configured', [
          address,
          optionsId,
        ]),
        context: {
          call: 'configured',
          args: [address, optionsId],
        },
      });
    }
  }

  async setDeploymentInfo(contract: Contract, settingsId: BytesLike) {
    debug(
      'contract',
      contract.address,
      'deploy transaction',
      contract.deployTransaction?.hash
    );

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
      constructSettings: settingsId,
      initializeSettings: constants.HashZero,
      initialized: false,
      lastConfiguredSettings: constants.HashZero,
    };
  }
}
