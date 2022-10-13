import {BytesLike, Contract, ContractFactory} from 'ethers';
import {
  AddressValues,
  ConfigOrConstructor,
  ConfigureOptions,
  ConstructorOptions,
  ContractConfiguration,
  ContractSuite,
  DependencyConfig,
} from './types';
import {camel} from 'case';
import {Deployer} from '../utils';
import {Registry} from './registry';
import {ethers} from 'hardhat';
import {debug} from '../utils/log';
import {RoleManager} from './role-manager';
import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeploymentRegistry} from '../../typechain-types';

export type ContractConfigurationWithId = ContractConfiguration & {id: string};

interface ContractMetadata {
  initialized: boolean;
  canUpgrade: boolean;
}

export class Environment {
  private readonly dependencyConfigs: DependencyConfig[] = [];
  public readonly deployer = (process.env.DEPLOYER
    ? this.hre.ethers.getSigner(process.env.DEPLOYER)
    : this.hre.ethers.getSigners().then(signers => signers[0])
  ).then(signer => new Deployer(signer));
  public readonly registry = Registry.from(this.deployer);
  public readonly roles = new RoleManager();
  public readonly addresses: Promise<Record<string, string>>;
  public readonly configs: Promise<ContractConfigurationWithId[]>;
  public readonly ready: Promise<boolean>;
  public readonly factories = new Map<string, ContractFactory>();
  public readonly contracts = new Map<string, Contract>();
  public readonly metadata: Record<string, ContractMetadata> = {};

  constructor(public readonly hre: HardhatRuntimeEnvironment) {
    const loaded = this._loadConfigurations();

    this.ready = loaded.then(() => true);
    this.addresses = loaded.then(({addressSuite}) => addressSuite);
    this.configs = loaded.then(({configs}) => configs);
  }

  register<T extends ContractFactory = ContractFactory>(
    configOrConstructor: ConfigOrConstructor<T>,
    deps: number[] = []
  ) {
    return this.dependencyConfigs.push({
      configOrConstructor: configOrConstructor,
      deps,
    });
  }

  async upgrade() {
    const [registry, addresses] = await Promise.all([
      this.registry,
      this.addresses,
    ]);

    debug('address suite', addresses);

    const contracts = await this._deployConfigurations();

    await this._registerRoles(contracts);
    await this._grantRoles(contracts);

    const passing = await this._initialize(contracts);
    await this._prepareConfig(passing, contracts);
    await this._configure(passing, contracts);

    await registry.sync();

    return contracts as ContractSuite;
  }

  private async _parseConfig(
    configOrConstructor: ConfigOrConstructor,
    options: ConstructorOptions,
    addressSuite: Record<string, string>
  ): Promise<ContractConfigurationWithId> {
    const config =
      typeof configOrConstructor === 'function'
        ? await configOrConstructor(options, addressSuite)
        : configOrConstructor;

    const id = config.id ?? camel(config.name);

    if (addressSuite[id]) {
      throw new Error('duplicate id ' + id);
    }

    addressSuite[id] = await this._getAddress(config);

    return {
      ...config,
      id,
    };
  }

  private async _factory(name: string) {
    let factory = this.factories.get(name);
    if (factory) {
      return factory;
    }

    factory = await this.hre.ethers.getContractFactory(name);
    this.factories.set(name, factory);
    return factory;
  }

  private async _getAddress(config: ContractConfiguration) {
    const factory = await this._factory(config.name);
    const deployer = await this.deployer;

    if (config.proxy) {
      switch (config.proxy.type) {
        case 'TransparentUpgradeableProxy':
          return deployer.templates.transparentUpgradeableProxyAddress(
            config.proxy.id || id,
            config.proxy.options?.salt
          );
          break;
        case 'UpgradeableBeacon':
          return deployer.templates.upgradeableBeaconAddress(
            config.proxy.id || id,
            config.proxy.options?.salt
          );
          break;
      }
    }

    return deployer.factoryAddress(factory, {
      args: config.deployOptions?.args,
    });
  }

  private _fetchDependencies() {}

  private _loadDependencies() {
    const sortedConfigs: DependencyConfig[] = [];

    const configs: Record<
      number,
      {
        remaining: number[];
        dependers: number[];
      }
    > = {};
    const ids = new WeakMap<DependencyConfig, number>();

    this.dependencyConfigs.forEach((curConfig, i) => {
      const curId = i + 1;
      const config = {
        dependers: configs[curId]?.dependers || [],
        id: curId,
        remaining: curConfig.deps.concat(),
      };
      ids.set(curConfig, curId);
      if (curConfig.deps.length > 0) {
        curConfig.deps.forEach(depIndex => {
          configs[depIndex] = configs[depIndex] || {
            dependers: [],
            remaining: [],
          };
          configs[depIndex].dependers.push(curId);
        });
      } else {
        sortedConfigs.push(curConfig);
      }
      configs[curId] = config;
    });

    for (let i = 0; i < sortedConfigs.length; i++) {
      const curDep = sortedConfigs[i];
      const curId = ids.get(curDep)!;
      const config = configs[curId];

      config.dependers.forEach(depender => {
        const dependerConfig = configs[depender];
        const index = dependerConfig.remaining.indexOf(curId);
        if (index >= 0) dependerConfig.remaining.splice(index, 1);
        if (dependerConfig.remaining.length === 0) {
          sortedConfigs.push(this.dependencyConfigs[depender - 1]);
        }
      });

      ids.delete(curDep);
    }

    if (sortedConfigs.length !== this.dependencyConfigs.length) {
      throw new Error('Missing Dependencies');
    }

    return sortedConfigs;
  }

  private async _registerRoles(contractSuite: Record<string, Contract>) {
    const configs = await this.configs;
    for (const config of configs) {
      const contract = contractSuite[config.id];
      if (!contract) {
        debug('missing contract for ' + config.id);
      }

      Object.values(config.roles || {}).forEach(role => {
        this.roles.register(role, contract);
      });
    }
    return this.roles;
  }

  private async _grantRoles(contractSuite: Record<string, Contract>) {
    const configs = await this.configs;
    for (const config of configs) {
      const contract = contractSuite[config.id];

      if (!contract) {
        console.error('missing contract for', config.name);
      }

      if (config.requiredRoles && contract) {
        try {
          console.log('granting-roles', config.name);
          for (const requiredRole of config.requiredRoles) {
            if (typeof requiredRole === 'symbol') {
              await this.roles.grant(requiredRole, contract.address);
            } else {
              await requiredRole(contract.address);
            }
          }
        } catch (e: any) {
          // TODO add context to the rolesMapping
          console.log('failed grant role for', config.name, '-', e.message);
        }
      }
    }
  }

  private async _loadConfigurations() {
    const configs: ContractConfigurationWithId[] = [];
    const addressSuite: Record<string, string> = {};

    for (const {configOrConstructor} of this._loadDependencies()) {
      configs.push(
        await this._parseConfig(
          configOrConstructor,
          this.hre.config.environment.constructorOptions,
          addressSuite
        )
      );
    }

    return {configs, addressSuite};
  }

  private async _deployConfigurations() {
    const [configs, deployer, registry] = await Promise.all([
      this.configs,
      this.deployer,
      this.registry,
    ]);
    const contractSuite: Record<string, Contract> = {};

    const constructorId = await registry.registerOptions(
      this.hre.config.environment.constructorOptions
    );

    for (const config of configs) {
      console.log('deploying', config.name);

      try {
        const factory = await this._factory(config.name);
        let contract = await deployer.deploy(factory, config.deployOptions);

        await contract.deployed();
        await registry.setDeploymentInfo(contract, constructorId);

        if (config.proxy) {
          switch (config.proxy.type) {
            case 'TransparentUpgradeableProxy':
              contract = await deployer.templates.transparentUpgradeableProxy(
                config.proxy.id || config.id,
                contract,
                config.proxy.options
              );
              break;
            case 'UpgradeableBeacon':
              contract = await deployer.templates.upgradeableBeacon(
                config.proxy.id || config.id,
                config.proxy.options?.salt
              );
              break;
          }
        }

        contractSuite[config.id] = contract;
      } catch (e: unknown) {
        console.error(
          'failed to deploy',
          config.name,
          ' - ',
          (e as Error).message
        );
      }
    }

    for (const config of configs) {
      try {
        await config.deployed?.(contractSuite);
      } catch (e: any) {
        console.error(
          'event handler "deployed" failed for',
          config.name,
          ' - ',
          e.message
        );
      }
    }

    return contractSuite;
  }

  private async _initialize(contracts: Record<string, Contract>) {
    const [configs, registry, addresses] = await Promise.all([
      this.configs,
      this.registry,
      this.addresses,
    ]);

    const deploymentInfo = await registry.deploymentInfo(addresses);
    debug('deployment info', deploymentInfo);

    const constructorId = await registry.registerOptions(
      this.hre.config.environment.constructorOptions
    );

    const initialized: ContractConfigurationWithId[] = [];
    const passing: Record<string, boolean> = {};

    for (const config of configs) {
      const id = camel(config.name) as keyof ContractSuite;
      const contract = contracts[config.id];
      passing[id] = true;

      if (!contract) {
        console.error('missing contract for', config.name);
        passing[id] = false;
        continue;
      }

      if (!deploymentInfo[id].initialized && config.initialize) {
        try {
          console.log('initializing', config.name);
          await config.initialize(
            contracts,
            this.hre.config.environment.configureOptions,
            this.hre.config.environment.configureOptions
          );

          registry.setInitialized(contract.address, constructorId);
          initialized.push(config);
        } catch (e: any) {
          passing[id] = false;
          console.error('failed initializing', config.name, '-', e.message, e);
        }
      }
    }

    for (const config of initialized) {
      if (config.initialized) {
        try {
          console.log('event initialized', config.name);
          await config.initialized(contracts);
        } catch (e: any) {
          console.error(
            'event "initialized" failed for',
            config.name,
            '-',
            e.message
          );
        }
      }
    }

    return passing;
  }

  private async _prepareConfig(
    passing: Record<string, boolean>,
    contracts: Record<string, Contract>
  ) {
    const configs = await this.configs;
    for (const config of configs) {
      const id = camel(config.name) as keyof ContractSuite;
      if (passing[id] && config.prepareConfig) {
        try {
          console.log('preparing config', config.name);
          await config.prepareConfig(
            contracts,
            this.hre.config.environment.configureOptions
          );
        } catch (e: any) {
          console.error(
            'prepareConfig failed for',
            config.name,
            '-',
            e.message
          );
        }
      }
    }
  }

  private async _configure(
    passing: Record<string, boolean>,
    contracts: Record<string, Contract>
  ) {
    const [configs, registry] = await Promise.all([
      this.configs,
      this.registry,
    ]);

    const configureId = await registry.registerOptions(
      this.hre.config.environment.configureOptions
    );

    const configured: ContractConfigurationWithId[] = [];

    for (const config of configs) {
      const id = camel(config.name) as keyof ContractSuite;
      const contract = contracts[config.id];

      if (!contract) {
        console.error('missing contract for', config.name);
      }

      if (passing[id] && config.configure && contract) {
        try {
          console.log('configuring', config.name);
          await config.configure(
            contracts,
            this.hre.config.environment.configureOptions,
            this.hre.config.environment.constructorOptions
          );
          configured.push(config);
          registry.setConfigured(contract.address, configureId);
        } catch (e: any) {
          console.error('configure failed for', config.name, ' - ', e.message);
        }
      }
    }

    for (const config of configured) {
      if (config.configured) {
        try {
          console.log('event configured', config.name);
          await config.configured(contracts);
        } catch (e: any) {
          console.error(
            'event "configured" failed for',
            config.name,
            ' - ',
            e.message
          );
        }
      }
    }
  }
}
