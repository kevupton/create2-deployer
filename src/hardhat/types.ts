import {ContractFactory} from 'ethers';
import {
  Deployer,
  DeployOptions,
  DeployTemplateOptions,
  FunctionCallOptions,
} from '../deployer';
import {DeploymentInfo, Registry} from './registry';
import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {FactoryInstance} from '../deployer/types';
import {PromiseOrValue} from '../../typechain-types/common';
import {Libraries} from '@nomiclabs/hardhat-ethers/types';

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

  deploy(): Promise<FactoryInstance<T>>;

  configure(): Promise<void>;
}

export interface BaseConfiguration<
  T extends ContractFactory = ContractFactory
> {
  id?: string;
  name: string;
  roles?: Record<string, symbol>;
  requiredRoles?: (symbol | ((account: string) => Promise<void>))[];

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
  deployOptions?: DeployOptions<T>;
}

export interface ProxyConfiguration<T extends ContractFactory = ContractFactory>
  extends BaseConfiguration<T> {
  deployOptions?:
    | DeployOptions<T>
    | ((options: DeploymentInfo) => PromiseOrValue<DeployOptions<T>>);
  proxy:
    | ({
        type: 'TransparentUpgradeableProxy';
        owner?: string;
        proxyAdmin?: string;
        initialize?: FunctionCallOptions<FactoryInstance<T>>;
        upgrade?: FunctionCallOptions<FactoryInstance<T>>;
      } & DeployTemplateOptions)
    | ({
        type: 'UpgradeableBeacon';
        owner?: string;
        initialize?: FunctionCallOptions<FactoryInstance<T>>;
        upgrade?: FunctionCallOptions<FactoryInstance<T>>;
      } & DeployTemplateOptions);
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
  finalize?: DependencyConfig[];
  address?: DependencyConfig[];
}

export type DetailedDependenciesLoaded = {
  [key in keyof DetailedDependencies]: DependencyConfigLoaded[];
};

export interface DependencyConfig<T extends ContractFactory = ContractFactory> {
  config: ConfigOrConstructor<T>;
  deps?: DependencyConfig[] | DetailedDependencies;
}

export interface DependencyConfigLoaded<
  T extends ContractFactory = ContractFactory
> {
  config: ContractConfigurationWithId<T>;
  deps?: DependencyConfigLoaded[] | DetailedDependenciesLoaded;
}

export interface VerificationSubtaskArgs {
  address: string;
  constructorArguments?: any[];
  // Fully qualified name of the contract
  contract?: string;
  libraries?: Libraries;
  noCompile?: boolean;
}
