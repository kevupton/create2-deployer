import {BigNumberish, ContractFactory} from 'ethers';
import {Deployer, DeployOptions, ProxyOptions} from '../utils';

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface ConfigureOptions {}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface ConstructorOptions {}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
// export interface InitializeOptions {}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface ContractSuite {}

export interface ContractConfiguration<
  T extends ContractFactory = ContractFactory
> {
  id?: string;
  name: string;
  roles?: Record<string, symbol>;
  requiredRoles?: (symbol | ((account: string) => Promise<void>))[];
  deployOptions?: DeployOptions<T>;
  proxy?:
    | {
        id?: string;
        type: 'TransparentUpgradeableProxy';
        options?: ProxyOptions<Awaited<ReturnType<T['deploy']>>>;
      }
    | {
        id?: string;
        type: 'UpgradeableBeacon';
        options?: {
          salt: BigNumberish;
        };
      };
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
}

export type ProxyType = 'TransparentUpgradeableProxy';

export type AddressValues<T extends object> = {
  [key in keyof T]: string;
};

export type ConfigOrConstructor<T extends ContractFactory = ContractFactory> =
  | ContractConfiguration<T>
  | ((
      options: ConstructorOptions,
      contracts: AddressValues<ContractSuite>
    ) => Promise<ContractConfiguration<T>> | ContractConfiguration<T>);

export interface DependencyConfig {
  configOrConstructor: ConfigOrConstructor;
  deps: number[];
}