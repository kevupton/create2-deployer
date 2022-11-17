import {BigNumberish, ContractFactory} from 'ethers';
import {DeployOptions, ProxyOptions} from '../deployer';
import {DeploymentInfo} from './registry';

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface ConfigureOptions {}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface ConstructorOptions {}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
// export interface InitializeOptions {}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface ContractSuite {}

export interface BaseConfiguration<
  T extends ContractFactory = ContractFactory
> {
  id?: string;
  name: string;
  roles?: Record<string, symbol>;
  requiredRoles?: (symbol | ((account: string) => Promise<void>))[];
  dependencies?: string[];

  deployed?(contracts: ContractSuite): Promise<void> | void;

  initialize?(
    contracts: ContractSuite,
    constructorOptions: ConstructorOptions,
    configureOptions: ConfigureOptions
  ): Promise<void> | void;

  initialized?(contracts: ContractSuite): Promise<void> | void;

  prepareConfig?(
    contracts: ContractSuite,
    options: ConfigureOptions
  ): Promise<ConfigureOptions> | ConfigureOptions;

  configure?(
    contracts: ContractSuite,
    options: ConfigureOptions,
    constructorOptions: ConstructorOptions
  ): Promise<void> | void;

  configured?(contracts: ContractSuite): Promise<void> | void;

  finalized?(contracts: ContractSuite): Promise<void> | void;
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
        options?: ProxyOptions<Awaited<ReturnType<T['deploy']>>>;
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
