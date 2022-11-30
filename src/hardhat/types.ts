import {BigNumberish, ContractFactory} from 'ethers';
import {
  ContractFromFactory,
  Deployer,
  DeployOptions,
  ProxyOptions,
} from '../deployer';
import {DeploymentInfo, Registry} from './registry';
import {HardhatRuntimeEnvironment} from 'hardhat/types';

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface ConfigureOptions {}

// TODO should these options be merged?
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface ConstructorOptions {}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
// export interface InitializeOptions {}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface ContractSuite {}

export type AddressSuite = {
  [key in keyof ContractSuite]: string;
};

export interface CallbackContext<T extends ContractFactory = ContractFactory> {
  deployer: Deployer;
  contracts: ContractSuite;
  registry: Registry;
  addresses: AddressSuite;
  hre: HardhatRuntimeEnvironment;
  constructorOptions: ConstructorOptions;
  configureOptions: ConfigureOptions;
  config: ContractConfigurationWithId<T>;

  deploy(): Promise<ContractFromFactory<T>>;

  configure(): Promise<void>;
}

export interface BaseConfiguration<
  T extends ContractFactory = ContractFactory
> {
  id?: string;
  name: string;
  roles?: Record<string, symbol>;
  requiredRoles?: (symbol | ((account: string) => Promise<void>))[];
  dependencies?: string[];

  deployed?(
    this: Omit<CallbackContext<T>, 'contracts'> & {
      contracts: Partial<ContractSuite>;
    }
  ): Promise<void> | void;

  initialize?(this: CallbackContext): Promise<void> | void;

  initialized?(this: CallbackContext): Promise<void> | void;

  prepareConfig?(
    this: CallbackContext
  ): Promise<ConfigureOptions> | ConfigureOptions;

  configure?(this: CallbackContext): Promise<void> | void;

  configured?(this: CallbackContext): Promise<void> | void;

  finalize?(this: CallbackContext): Promise<void> | void;

  finalized?(this: CallbackContext): Promise<void> | void;
}

export interface DefaultConfiguration<T extends ContractFactory>
  extends BaseConfiguration<T> {
  deployOptions?: DeployOptions<T>;
}

export interface ProxyConfiguration<T extends ContractFactory = ContractFactory>
  extends BaseConfiguration<T> {
  deployOptions?:
    | DeployOptions<T>
    | ((
        options: DeploymentInfo
      ) => DeployOptions<T> | PromiseLike<DeployOptions<T>>);
  proxy:
    | {
        id?: string;
        type: 'TransparentUpgradeableProxy';
        owner?: string;
        options?: ProxyOptions<ContractFromFactory<T>>;
      }
    | {
        id?: string;
        type: 'UpgradeableBeacon';
        owner?: string;
        options?: {
          salt: BigNumberish;
        };
      };
}

export type ContractConfiguration<T extends ContractFactory = ContractFactory> =
  DefaultConfiguration<T> | ProxyConfiguration<T>;

export type ContractConfigurationWithId<
  T extends ContractFactory = ContractFactory
> = ContractConfiguration<T> & {id: string};

export type ProxyType = 'TransparentUpgradeableProxy';

export type AddressValues<T extends object> = {
  [key in keyof T]: string;
};

export type ConfigOrConstructor<T extends ContractFactory = ContractFactory> =
  | string
  | ContractConfiguration<T>
  | ((
      options: ConstructorOptions,
      contracts: AddressValues<ContractSuite>
    ) => Promise<ContractConfiguration<T>> | ContractConfiguration<T>);

export interface DetailedDependencies {
  default?: DependencyConfig[];
  deploy?: DependencyConfig[];
  initialize?: DependencyConfig[];
  configure?: DependencyConfig[];
  address?: DependencyConfig[];
}

export interface DependencyConfig<T extends ContractFactory = ContractFactory> {
  config: ConfigOrConstructor<T>;
  deps?: DependencyConfig[] | DetailedDependencies;
}
