import {BigNumberish, ContractFactory, Overrides, Signer} from 'ethers';
import {getCreate2Deployer} from './get-create2-deployer';
import {defaultAbiCoder, hexConcat, hexDataLength} from 'ethers/lib/utils';

export type Head<T extends unknown[]> = T extends [
  ...other: infer Head,
  overrides?: unknown
]
  ? Head
  : Array<unknown>;

export interface DeployOptions<T extends ContractFactory> {
  args?: Head<Parameters<T['deploy']>>;
  salt?: BigNumberish;
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

  constructor(
    public readonly signer: Signer,
    public readonly defaultSalt: BigNumberish = 0
  ) {
    if (!this.signer) {
      throw new Error('missing provider inside signer');
    }
  }

  async deploy<T extends ContractFactory>(
    factory: T,
    {args, salt = this.defaultSalt, overrides = {}}: DeployOptions<T> = {}
  ) {
    const create2Deployer = await this.create2DeployerPromise;
    const contractAddress = await this.deployAddress(factory, {args, salt});
    const code = await this.provider.getCode(contractAddress);
    const contract = factory
      .connect(this.signer)
      .attach(contractAddress) as ReturnType<T['attach']>;

    if (hexDataLength(code)) {
      contract._deployedPromise = Promise.resolve(contract);
    } else {
      const bytecode = Deployer.bytecode(factory, args);
      const tx = await create2Deployer.deploy(bytecode, salt, overrides);
      contract._deployedPromise = tx.wait().then(() => contract);
      Object.defineProperty(contract, 'deployTransaction', {
        writable: false,
        value: tx,
      });
    }

    return contract;
  }

  async deployAddress<T extends ContractFactory>(
    factory: T,
    {args, salt = this.defaultSalt}: DeployAddressOptions<T> = {}
  ): Promise<string> {
    const create2Deployer = await this.create2DeployerPromise;
    const bytecode = Deployer.bytecode(factory, args);
    return create2Deployer.deployAddress(bytecode, salt);
  }

  async createTemplate<T extends ContractFactory>(
    factory: T,
    {args, overrides = {}}: CreateTemplateOptions<T> = {}
  ) {
    const create2Deployer = await this.create2DeployerPromise;
    const templateId = await this.templateId(factory, args);
    const template = await create2Deployer.template(templateId);

    if (!hexDataLength(template)) {
      await create2Deployer
        .createTemplate(Deployer.bytecode(factory, args), overrides)
        .then(tx => tx.wait());
    }

    return templateId;
  }

  async templateId<T extends ContractFactory>(
    factory: T,
    args?: Head<Parameters<T['deploy']>>
  ) {
    const create2Deployer = await this.create2DeployerPromise;
    return await create2Deployer.templateId(Deployer.bytecode(factory, args));
  }

  static from(signer: Signer, defaultSalt: BigNumberish) {
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
}
