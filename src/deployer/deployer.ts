import {
  BigNumber,
  BigNumberish,
  BytesLike,
  Contract,
  ContractFactory,
  ContractTransaction,
  Overrides,
} from 'ethers';
import {
  defaultAbiCoder,
  hexConcat,
  hexDataLength,
  hexDataSlice,
  hexZeroPad,
  keccak256,
  toUtf8Bytes,
} from 'ethers/lib/utils';
import {Artifact} from 'hardhat/types';
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers';
import {Create2Deployer} from '../../typechain-types/contracts/Create2Deployer';
import {JsonRpcSigner} from '@ethersproject/providers';
import {Create2Deployer__factory} from '../../typechain-types';
import {PromiseOrValue} from '../../typechain-types/common';
import {CREATE2_DEPLOYER_ADDRESS} from './constants';
import {InstanceFactory, FactoryInstance} from './types';
import {debug, wait} from '../utils';
import {getOverrides} from './helpers';

export type Head<T extends unknown[]> = T extends [
  ...other: infer Head,
  overrides?: unknown
]
  ? Head
  : Array<unknown>;

export interface OptionsBase {
  id?: string;
  salt?: BigNumberish;
}

export interface OptionsOverrides {
  overrides?: Overrides & {from?: string | Promise<string>};
}

export interface OptionsCalls {
  calls?: (Create2Deployer.FunctionCallStruct | PromiseOrValue<BytesLike>)[];
}

export interface OptionsArgs<T extends InstanceFactory> {
  args?: Head<Parameters<T['deploy']>>;
}

export type DeployOptions<T extends InstanceFactory = InstanceFactory> =
  OptionsBase & OptionsOverrides & OptionsCalls & OptionsArgs<T>;
export type CloneOptions = OptionsBase & OptionsOverrides;
export type DeployArtifactOptions = OptionsBase &
  OptionsCalls &
  OptionsOverrides;
export type DeployTemplateOptions = OptionsBase &
  OptionsCalls &
  OptionsOverrides;
export type DeployTemplateFromFactoryOptions<
  T extends InstanceFactory = InstanceFactory
> = OptionsBase & OptionsCalls & OptionsArgs<T> & OptionsOverrides;
export type FactoryAddressOptions<T extends InstanceFactory = InstanceFactory> =
  OptionsBase & OptionsArgs<T>;
export type TemplateAddressOptions = OptionsBase;
export type DeployAddressOptions = OptionsBase;
export type CloneAddressOptions = OptionsBase;
export type CreateTemplateOptions<T extends ContractFactory> = OptionsArgs<T> &
  OptionsOverrides;

export class Deployer {
  public readonly provider = this.signer.provider!;
  public readonly create2Deployer = Create2Deployer__factory.connect(
    CREATE2_DEPLOYER_ADDRESS,
    this.signer
  );
  public readonly address = CREATE2_DEPLOYER_ADDRESS;

  public constructor(
    public readonly signer: SignerWithAddress,
    public readonly defaultSalt: BigNumberish = process.env.DEFAULT_SALT || '0'
  ) {
    if (!this.signer) {
      throw new Error('missing provider inside signer');
    }
  }

  async validate(...args: any[]) {
    if (!this.signer.provider) {
      throw new Error('Signer missing provider');
    }

    const code = await this.signer.provider.getCode(CREATE2_DEPLOYER_ADDRESS);

    if (!hexDataLength(code)) {
      console.error('context', ...args);
      throw new Error('Create2 deployer not deployed on this network yet.');
    }
  }

  async deploy<T extends ContractFactory>(
    factory: T,
    {
      id,
      args,
      calls = [],
      salt = this.defaultSalt,
      overrides,
    }: DeployOptions<T> = {}
  ): Promise<FactoryInstance<T>> {
    await this.validate('deploy', factory);
    const contractAddress = Deployer.factoryAddress(factory, {id, args, salt});
    const code = await this.provider.getCode(contractAddress);
    const contract = factory
      .connect(this.signer)
      .attach(contractAddress) as FactoryInstance<T>;

    if (hexDataLength(code)) {
      contract._deployedPromise = Promise.resolve(contract);
    } else {
      const bytecode = Deployer.bytecode(factory, args);
      const tx = await this.create2Deployer.deploy(
        bytecode,
        this.generateSalt(id, salt),
        await Deployer.formatCalls(calls, contractAddress),
        getOverrides(overrides, this.provider)
      );
      contract._deployedPromise = wait(tx, {
        name: 'Deploy(' + factory.constructor.name + ')',
        action: 'deploy',
        address: contractAddress,
      }).then(() => contract);
      Object.defineProperty(contract, 'deployTransaction', {
        writable: false,
        value: tx,
      });
    }

    return contract;
  }

  async clone(
    target: string,
    {id, salt, overrides}: CloneOptions = {}
  ): Promise<{
    address: string;
    deployed: Promise<string>;
    deployTransaction?: ContractTransaction;
  }> {
    await this.validate('clone', target);
    const contractAddress = this.cloneAddress(target, {id, salt});
    const code = await this.provider.getCode(contractAddress);

    if (hexDataLength(code)) {
      return {
        deployed: Promise.resolve(contractAddress),
        address: contractAddress,
      };
    } else {
      const tx = await this.create2Deployer.clone(
        target,
        this.generateSalt(id, salt),
        getOverrides(overrides, this.provider)
      );
      return {
        address: contractAddress,
        deployed: wait(tx, {
          name: 'Clone(' + target + ')',
          address: contractAddress,
          action: 'clone',
        }).then(() => contractAddress),
        deployTransaction: tx,
      };
    }
  }

  async deployArtifact(
    artifact: Artifact,
    args: BytesLike = '0x',
    {id, salt = this.defaultSalt, calls = [], overrides}: DeployArtifactOptions
  ): Promise<Contract> {
    await this.validate('deployArtifact', artifact);
    const bytecode = hexConcat([artifact.bytecode, args]);
    const contractAddress = Deployer.deployAddress(bytecode, {id, salt});
    const code = await this.provider.getCode(contractAddress);
    const contract = new Contract(contractAddress, artifact.abi, this.signer);

    if (hexDataLength(code)) {
      contract._deployedPromise = Promise.resolve(contract);
    } else {
      const tx = await this.create2Deployer.deploy(
        bytecode,
        this.generateSalt(id, salt),
        await Deployer.formatCalls(calls, contractAddress),
        getOverrides(overrides, this.provider)
      );
      contract._deployedPromise = wait(tx, {
        name: 'Artifact(' + artifact.contractName + ')',
        action: 'deploy',
        address: contractAddress,
      }).then(() => contract);
      Object.defineProperty(contract, 'deployTransaction', {
        writable: false,
        value: tx,
      });
    }

    return contract;
  }

  factoryAddress<T extends ContractFactory>(
    factory: T,
    {id, args, salt = this.defaultSalt}: FactoryAddressOptions<T> = {}
  ): string {
    return Deployer.factoryAddress(factory, {id, args, salt});
  }

  cloneAddress(
    target: BytesLike,
    {id, salt}: CloneAddressOptions = {}
  ): string {
    return Deployer.cloneAddress(target, this.generateSalt(id, salt));
  }

  async templateAddress(
    templateId: PromiseOrValue<BytesLike>,
    {id, salt}: TemplateAddressOptions = {}
  ) {
    await this.validate('templateAddress', templateId);
    return await this.create2Deployer.templateAddress(
      templateId,
      this.generateSalt(id, salt)
    );
  }

  async deployTemplate(
    templateId: PromiseOrValue<BytesLike>,
    {id, salt, calls = [], overrides}: DeployTemplateOptions = {}
  ) {
    await this.validate('deployTemplate', templateId);
    const contractAddress = await this.templateAddress(templateId, {id, salt});
    const code = await this.provider.getCode(contractAddress);

    debug('deploying template ' + templateId);

    if (hexDataLength(code)) {
      return;
    }

    await this.create2Deployer
      .deployTemplate(
        templateId,
        this.generateSalt(id, salt),
        await Deployer.formatCalls(calls, contractAddress),
        getOverrides(overrides, this.provider)
      )
      .then(tx => {
        debug('template deployed ' + tx.hash);
        return tx;
      })
      .then(
        wait.withContext({
          name: 'Template: ' + templateId,
          action: 'deployTemplate',
        })
      );
  }

  async deployTemplateFromFactory<T extends ContractFactory>(
    factory: T,
    {
      id,
      salt,
      calls = [],
      args,
      overrides,
    }: DeployTemplateFromFactoryOptions<T> = {}
  ) {
    await this.validate('deployTemplateFromFactory', factory);
    const templateId = Deployer.templateId(factory, args);
    const contractAddress = this.factoryAddress(factory, {
      id,
      salt,
      args,
    });
    debug('deploying template ' + templateId);
    const code = await this.provider.getCode(contractAddress);
    const contract = factory
      .connect(this.signer)
      .attach(contractAddress) as FactoryInstance<T>;

    if (hexDataLength(code)) {
      contract._deployedPromise = Promise.resolve(contract);
    } else {
      const tx = await this.create2Deployer.deployTemplate(
        templateId,
        this.generateSalt(id, salt),
        await Deployer.formatCalls(calls, contractAddress),
        getOverrides(overrides, this.provider)
      );
      contract._deployedPromise = wait(tx, {
        name: 'Template(' + templateId + ')',
        action: 'deploy',
        address: contractAddress,
      }).then(() => contract);
      Object.defineProperty(contract, 'deployTransaction', {
        writable: false,
        value: tx,
      });
    }

    return contract;
  }

  async createTemplate<T extends ContractFactory>(
    factory: T,
    {args, overrides}: CreateTemplateOptions<T> = {}
  ) {
    await this.validate('deploy', factory);
    const templateId = Deployer.templateId(factory, args);
    const exists = await this.create2Deployer.templateExists(templateId);
    debug('creating template ' + factory.constructor.name);

    if (!exists) {
      await this.create2Deployer
        .createTemplate(
          Deployer.bytecode(factory, args),
          getOverrides(overrides, this.provider)
        )
        .then(tx => {
          debug('hash: ' + tx.hash);
          return tx;
        })
        .then(
          wait.withContext({
            name: factory.constructor.name,
            action: 'createTemplate',
          })
        );
    }

    return templateId;
  }

  static templateId<T extends ContractFactory = ContractFactory>(
    factory: T,
    args?: Head<Parameters<T['deploy']>>
  ) {
    return keccak256(Deployer.bytecode(factory, args));
  }

  static bytecode(factory: ContractFactory, args: unknown[] = []) {
    const abiEncodedArgs = args
      ? defaultAbiCoder.encode(
          factory.interface.deploy.inputs.map(param => param.format('full')),
          args
        )
      : '0x';
    return hexConcat([factory.bytecode, abiEncodedArgs]);
  }

  private static cloneAddress(target: BytesLike, salt: BigNumberish) {
    const hashed = keccak256(
      hexConcat([
        '0x3d602d80600a3d3981f3363d3d373d3d3d363d73',
        target,
        '0x5af43d82803e903d91602b57fd5bf3ff',
      ])
    );

    return hexDataSlice(
      keccak256(
        hexConcat([
          CREATE2_DEPLOYER_ADDRESS,
          hexZeroPad(BigNumber.from(salt).toHexString(), 32),
          hashed,
        ])
      ),
      0,
      20
    );
  }

  static factoryAddress<T extends ContractFactory>(
    factory: T,
    {id, args, salt}: FactoryAddressOptions<T> = {}
  ): string {
    return this.deployAddress(this.bytecode(factory, args), {id, salt});
  }

  static deployAddress(
    bytecode: BytesLike,
    {id, salt}: DeployAddressOptions = {}
  ) {
    const hash = keccak256(
      hexConcat([
        '0xff',
        CREATE2_DEPLOYER_ADDRESS,
        this.generateSalt(id, salt),
        keccak256(bytecode),
      ])
    );
    return hexDataSlice(hash, 12, 32);
  }

  static async from(signer: JsonRpcSigner, defaultSalt?: BigNumberish) {
    return new Deployer(await SignerWithAddress.create(signer), defaultSalt);
  }

  static async formatCalls(
    calls: (Create2Deployer.FunctionCallStruct | PromiseOrValue<BytesLike>)[],
    defaultTarget: string
  ): Promise<Create2Deployer.FunctionCallStruct[]> {
    return Promise.all(
      calls.map(async (call): Promise<Create2Deployer.FunctionCallStruct> => {
        call = await call;
        if (typeof call === 'string' || 'length' in call) {
          return {
            target: defaultTarget,
            data: call,
          };
        } else {
          return call;
        }
      })
    );
  }

  generateSalt(id?: string, salt = this.defaultSalt) {
    return Deployer.generateSalt(id, salt);
  }

  static generateSalt(id?: string, salt: BigNumberish = BigNumber.from(0)) {
    salt = BigNumber.from(salt).toHexString();
    if (id) {
      salt = keccak256(hexConcat([toUtf8Bytes(id), salt]));
    }
    return hexZeroPad(salt, 32);
  }
}
