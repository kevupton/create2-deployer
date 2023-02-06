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
export interface EnvironmentSettings {}

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
  settings: EnvironmentSettings;
  config: ContractConfigurationWithId<T>;

  deploy(): Promise<ContractFromFactory<T>>;

  configure(): Promise<void>;
}

export interface DeployOptionsWithId<
  T extends ContractFactory = ContractFactory
> extends DeployOptions<T> {
  id?: string;
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

  prepareInitialize?(
    this: CallbackContext
  ): Promise<EnvironmentSettings> | EnvironmentSettings;

  prepareConfigure?(
    this: CallbackContext
  ): Promise<EnvironmentSettings> | EnvironmentSettings;

  prepareFinalize?(
    this: CallbackContext
  ): Promise<EnvironmentSettings> | EnvironmentSettings;

  configure?(this: CallbackContext): Promise<void> | void;

  configured?(this: CallbackContext): Promise<void> | void;

  finalize?(this: CallbackContext): Promise<void> | void;

  finalized?(this: CallbackContext): Promise<void> | void;
}

export interface DefaultConfiguration<T extends ContractFactory>
  extends BaseConfiguration<T> {
  deployOptions?: DeployOptionsWithId<T>;
}

export interface ProxyConfiguration<T extends ContractFactory = ContractFactory>
  extends BaseConfiguration<T> {
  deployOptions?:
    | DeployOptionsWithId<T>
    | ((
        options: DeploymentInfo
      ) => DeployOptionsWithId<T> | PromiseLike<DeployOptionsWithId<T>>);
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
      options: EnvironmentSettings,
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
