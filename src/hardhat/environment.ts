import {Contract, ContractFactory} from 'ethers';
import {
  ConfigOrConstructor,
  ConstructorOptions,
  ContractConfiguration,
  ContractSuite,
  DependencyConfig,
} from './types';
import {camel} from 'case';
import {Registry} from './registry';
import {debug} from '../utils';
import {RoleManager} from './role-manager';
import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {glob} from 'glob';
import path from 'path';
import {Deployer} from '../deployer';

export type ContractConfigurationWithId = ContractConfiguration & {id: string};

export class Environment {
  public readonly deployer = (process.env.DEPLOYER
    ? this.hre.ethers.getSigner(process.env.DEPLOYER)
    : this.hre.ethers.getSigners().then(signers => signers[0])
  ).then(signer => new Deployer(signer));

  private _dependencies: Promise<DependencyConfig[]> | undefined;
  private _ready: Promise<{
    addressSuite: Record<string, string>;
    configs: ContractConfigurationWithId[];
  }>;
  private _factories = new Map<string, ContractFactory>();

  constructor(public readonly hre: HardhatRuntimeEnvironment) {
    this._ready = this._loadConfigurations();
  }

  get addresses() {
    return this._ready.then(val => val.addressSuite);
  }

  get configs() {
    return this._ready.then(val => val.configs);
  }

  reload() {
    this._factories.clear();
    this._ready = this._loadConfigurations();
  }

  async upgrade() {
    const [registry, addresses] = await Promise.all([
      Registry.from(this.deployer),
      this.addresses,
    ]);

    debug('address suite', addresses);

    const contracts = await this._deployConfigurations(registry);
    await this._grantRoles(contracts);

    const passing = await this._initialize(contracts, registry);
    await this._prepareConfig(passing, contracts);
    await this._configure(passing, contracts, registry);

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

    const id =
      typeof config === 'string'
        ? camel(config)
        : config.id ?? camel(config.name);

    if (addressSuite[id]) {
      throw new Error('duplicate id ' + id);
    }

    const newConfig: ContractConfigurationWithId = {
      ...(typeof config === 'string' ? {name: config} : config),
      id,
    };

    addressSuite[id] = await this._getAddress(newConfig);

    return newConfig;
  }

  private async _factory(name: string) {
    let factory = this._factories.get(name);
    if (factory) {
      return factory;
    }

    factory = await this.hre.ethers.getContractFactory(name);
    this._factories.set(name, factory);
    return factory;
  }

  private async _getAddress(config: ContractConfigurationWithId) {
    const factory = await this._factory(config.name);
    const deployer = await this.deployer;

    if (config.proxy) {
      switch (config.proxy.type) {
        case 'TransparentUpgradeableProxy':
          return deployer.templates.transparentUpgradeableProxyAddress(
            config.proxy.id || config.id,
            config.proxy.options?.salt
          );
        case 'UpgradeableBeacon':
          return deployer.templates.upgradeableBeaconAddress(
            config.proxy.id || config.id,
            config.proxy.options?.salt
          );
      }
    }

    return deployer.factoryAddress(factory, {
      args: config.deployOptions?.args,
    });
  }

  private async _fetchDependencies(): Promise<DependencyConfig[]> {
    if (this._dependencies) {
      return this._dependencies;
    }

    const matches = glob.sync(
      path.join(this.hre.config.environment.path, '*.config.ts')
    );

    // eslint-disable-next-line node/no-unsupported-features/es-syntax
    this._dependencies = Promise.all(matches.map(match => import(match))).then(
      results => results.map(value => value.default)
    );

    return this._dependencies;
  }

  private async _loadDependencies() {
    const dependencies = await this._fetchDependencies();
    const sortedConfigs: DependencyConfig[] = [];

    const configs = new WeakMap<
      DependencyConfig,
      {remaining: DependencyConfig[]; dependers: DependencyConfig[]}
    >();

    dependencies.forEach(curConfig => {
      const deps = curConfig.deps || [];
      const config = {
        dependers: configs.get(curConfig)?.dependers || [],
        remaining: deps.concat(),
      };
      if (deps.length > 0) {
        deps.forEach(dep => {
          configs.set(
            dep,
            configs.get(dep) || {
              dependers: [],
              remaining: [],
            }
          );
          configs.get(dep)!.dependers.push(curConfig);
        });
      } else {
        sortedConfigs.push(curConfig);
      }
      configs.set(curConfig, config);
    });

    for (let i = 0; i < sortedConfigs.length; i++) {
      const curDep = sortedConfigs[i];
      const config = configs.get(curDep)!;

      config.dependers.forEach(depender => {
        const dependerConfig = configs.get(depender)!;
        const index = dependerConfig.remaining.indexOf(curDep);
        if (index >= 0) dependerConfig.remaining.splice(index, 1);
        if (dependerConfig.remaining.length === 0) {
          sortedConfigs.push(depender);
        }
      });
    }

    if (sortedConfigs.length !== dependencies.length) {
      throw new Error('Missing Dependencies');
    }

    return sortedConfigs;
  }

  private _createRoleManager(
    configs: ContractConfigurationWithId[],
    contracts: Record<string, Contract>
  ) {
    const roles = new RoleManager();
    for (const config of configs) {
      const contract = contracts[config.id];
      if (!contract) {
        debug('missing contract for ' + config.id);
      }

      Object.values(config.roles || {}).forEach(role => {
        roles.register(role, contract);
      });
    }
    return roles;
  }

  private async _grantRoles(contracts: Record<string, Contract>) {
    const configs = await this.configs;
    const roles = await this._createRoleManager(configs, contracts);

    for (const config of configs) {
      const contract = contracts[config.id];

      if (!contract) {
        console.error('missing contract for', config.name);
      }

      if (config.requiredRoles && contract) {
        try {
          console.log('granting-roles', config.name);
          for (const requiredRole of config.requiredRoles) {
            if (typeof requiredRole === 'symbol') {
              await roles.grant(requiredRole, contract.address);
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

    for (const {config} of await this._loadDependencies()) {
      configs.push(
        await this._parseConfig(
          config,
          this.hre.config.environment.constructorOptions,
          addressSuite
        )
      );
    }

    return {configs, addressSuite};
  }

  private async _deployConfigurations(registry: Registry) {
    const [configs, deployer] = await Promise.all([
      this.configs,
      this.deployer,
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

  private async _initialize(
    contracts: Record<string, Contract>,
    registry: Registry
  ) {
    const [configs, addresses] = await Promise.all([
      this.configs,
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
    contracts: Record<string, Contract>,
    registry: Registry
  ) {
    const [configs] = await Promise.all([this.configs]);

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
