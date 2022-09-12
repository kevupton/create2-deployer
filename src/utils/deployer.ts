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
  CREATE2_DEPLOYER_ADDRESS,
  getCreate2Deployer,
} from './get-create2-deployer';
import {
  defaultAbiCoder,
  hexConcat,
  hexDataLength,
  hexDataSlice,
  hexZeroPad,
  keccak256,
} from 'ethers/lib/utils';
import {Artifact} from 'hardhat/types';
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers';
import {makeTemplates} from './templates';
import {Create2Deployer} from '../../typechain-types/Create2Deployer';

export type Head<T extends unknown[]> = T extends [
  ...other: infer Head,
  overrides?: unknown
]
  ? Head
  : Array<unknown>;

export interface DeployOptions<T extends ContractFactory> {
  args?: Head<Parameters<T['deploy']>>;
  salt?: BigNumberish;
  calls?: Create2Deployer.FunctionCallStruct[];
  overrides?: Overrides & {from?: string | Promise<string>};
}

export interface CloneOptions {
  salt?: BigNumberish;
  overrides?: Overrides & {from?: string | Promise<string>};
}

export interface DeployArtifactOptions {
  salt?: BigNumberish;
  calls?: Create2Deployer.FunctionCallStruct[];
  overrides?: Overrides & {from?: string | Promise<string>};
}

export interface DeployAddressOptions<T extends ContractFactory> {
  args?: Head<Parameters<T['deploy']>>;
  salt?: BigNumberish;
}

export interface CreateTemplateOptions<T extends ContractFactory> {
  args?: Head<Parameters<T['deploy']>>;
  overrides?: Overrides & {from?: string | Promise<string>};
}

export class Deployer {
  public readonly provider = this.signer.provider!;
  public readonly create2DeployerPromise = getCreate2Deployer(this.signer);
  public readonly address = CREATE2_DEPLOYER_ADDRESS;

  public readonly templates = makeTemplates(this, this.debugMode);

  constructor(
    public readonly signer: SignerWithAddress,
    public readonly defaultSalt: BigNumberish = process.env.DEFAULT_SALT || '0',
    public readonly debugMode = false
  ) {
    if (!this.signer) {
      throw new Error('missing provider inside signer');
    }
  }

  async deploy<T extends ContractFactory>(
    factory: T,
    {
      args,
      calls = [],
      salt = this.defaultSalt,
      overrides = {},
    }: DeployOptions<T> = {}
  ): Promise<ReturnType<T['attach']> & {isExisting: boolean}> {
    const create2Deployer = await this.create2DeployerPromise;
    const contractAddress = Deployer.factoryAddress(factory, {args, salt});
    const code = await this.provider.getCode(contractAddress);
    const contract = factory
      .connect(this.signer)
      .attach(contractAddress) as ReturnType<T['attach']> & {
      isExisting: boolean;
    };

    if (hexDataLength(code)) {
      contract._deployedPromise = Promise.resolve(contract);
      Object.defineProperty(contract, 'isExisting', {
        writable: false,
        value: true,
      });
    } else {
      const bytecode = Deployer.bytecode(factory, args);
      const tx = await create2Deployer.deploy(bytecode, salt, calls, overrides);
      Object.defineProperty(contract, 'deployTransaction', {
        writable: false,
        value: tx,
      });
      Object.defineProperty(contract, 'isExisting', {
        writable: false,
        value: false,
      });
    }

    return contract;
  }

  async clone(
    target: string,
    {salt = this.defaultSalt, overrides = {}}: CloneOptions = {}
  ): Promise<{
    address: string;
    isExisting: boolean;
    deployed: Promise<string>;
    deployTransaction?: ContractTransaction;
  }> {
    const create2Deployer = await this.create2DeployerPromise;
    const contractAddress = await this.cloneAddress(target, salt);
    const code = await this.provider.getCode(contractAddress);

    if (hexDataLength(code)) {
      return {
        isExisting: true,
        deployed: Promise.resolve(contractAddress),
        address: contractAddress,
      };
    } else {
      const tx = await create2Deployer.clone(target, salt, overrides);
      return {
        isExisting: false,
        address: contractAddress,
        deployed: tx.wait().then(() => contractAddress),
        deployTransaction: tx,
      };
    }
  }

  async deployArtifact(
    artifact: Artifact,
    args: BytesLike = '0x',
    {salt = this.defaultSalt, calls = [], overrides = {}}: DeployArtifactOptions
  ): Promise<Contract> {
    const create2Deployer = await this.create2DeployerPromise;
    const bytecode = hexConcat([artifact.bytecode, args]);
    const contractAddress = await Deployer.deployAddress(bytecode, salt);
    const code = await this.provider.getCode(contractAddress);
    const contract = new Contract(contractAddress, artifact.abi, this.signer);

    if (hexDataLength(code)) {
      contract._deployedPromise = Promise.resolve(contract);
    } else {
      const tx = await create2Deployer.deploy(bytecode, salt, calls, overrides);
      contract._deployedPromise = tx.wait().then(() => contract);
      Object.defineProperty(contract, 'deployTransaction', {
        writable: false,
        value: tx,
      });
    }

    return contract;
  }

  factoryAddress<T extends ContractFactory>(
    factory: T,
    {args, salt = this.defaultSalt}: DeployAddressOptions<T> = {}
  ): string {
    return Deployer.factoryAddress(factory, {args, salt});
  }

  cloneAddress<T extends ContractFactory>(
    target: BytesLike,
    salt = this.defaultSalt
  ): string {
    return Deployer.cloneAddress(target, salt);
  }

  async createTemplate<T extends ContractFactory>(
    factory: T,
    {args, overrides = {}}: CreateTemplateOptions<T> = {}
  ) {
    const create2Deployer = await this.create2DeployerPromise;
    const templateId = await Deployer.templateId(factory, args);
    const template = await create2Deployer.template(templateId);

    if (!hexDataLength(template)) {
      await create2Deployer
        .createTemplate(Deployer.bytecode(factory, args), overrides)
        .then(tx => tx.wait());
    }

    return templateId;
  }

  static templateId<T extends ContractFactory>(
    factory: T,
    args?: Head<Parameters<T['deploy']>>
  ) {
    return keccak256(Deployer.bytecode(factory, args));
  }

  static from(signer: SignerWithAddress, defaultSalt: BigNumberish) {
    return new Deployer(signer, defaultSalt);
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
    {args, salt}: DeployAddressOptions<T> = {}
  ): string {
    return this.deployAddress(this.bytecode(factory, args), salt || 0);
  }

  static deployAddress(bytecode: BytesLike, salt: BigNumberish) {
    salt = hexZeroPad(BigNumber.from(salt).toHexString(), 32);
    const hash = keccak256(
      hexConcat(['0xff', CREATE2_DEPLOYER_ADDRESS, salt, keccak256(bytecode)])
    );
    return hexDataSlice(hash, 12, 32);
  }
}
