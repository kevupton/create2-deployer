import {BigNumber, Contract, ContractFactory, ethers} from 'ethers';
import {
  CallbackContext,
  ConfigOrConstructor,
  EnvironmentSettings,
  ContractConfigurationWithId,
  ContractSuite,
  DependencyConfig,
  DetailedDependencies,
  ProxyConfiguration,
} from './types';
import {camel} from 'case';
import {Registry} from './registry';
import {debug, wait} from '../utils';
import {RoleManager} from './role-manager';
import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {glob} from 'glob';
import path from 'path';
import {ContractFromFactory, Deployer, DeployOptions} from '../deployer';
import {hexDataLength} from 'ethers/lib/utils';
import Safe from '@safe-global/safe-core-sdk';
import EthersAdapter from '@safe-global/safe-ethers-lib';
import {ProxyAdmin__factory, UpgradeableBeacon__factory} from '../proxies';
import {getAdminAddress} from '@openzeppelin/upgrades-core';

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
  private _parsedConfigs = new Map<
    ConfigOrConstructor,
    ContractConfigurationWithId
  >();
  private _contracts: Record<string, Contract> = {};
  private _settings: EnvironmentSettings;

  constructor(public readonly hre: HardhatRuntimeEnvironment) {
    this._ready = this._loadConfigurations('address');
    this._settings = this.hre.config.environment.settings;
  }

  get settings() {
    return this._settings;
  }

  get addresses() {
    return this._ready.then(val => val.addressSuite);
  }

  get contracts() {
    return this._contracts as ContractSuite;
  }

  get configs() {
    return this._ready.then(val => val.configs);
  }

  get registry() {
    return Registry.from(this.deployer);
  }

  reload() {
    this._parsedConfigs.clear();
    this._factories.clear();
    this._ready = this._loadConfigurations('address');
  }

  async getDeploymentInfo<T extends Record<string, string>>(contracts: T) {
    const registry = await Registry.from(this.deployer);
    return registry.deploymentInfo(contracts);
  }

  async upgrade() {
    const [registry, addresses] = await Promise.all([
      Registry.from(this.deployer),
      this.addresses,
    ]);

    debug('address suite', addresses);
    this._contracts = {};

    this._ready = this._loadConfigurations('deploy');
    await this._deployConfigurations(registry);
    await this._grantRoles();

    this._ready = this._loadConfigurations('initialize');
    await this._prepareSettings('initialize');
    const passing = await this._initialize(registry);

    this._ready = this._loadConfigurations('configure');
    await this._prepareSettings('configure', passing);
    await this._configure(passing, registry);

    await registry.sync();

    await this._prepareSettings('finalize', passing);
    await this._finalize(passing);

    return this.contracts as ContractSuite;
  }

  private async _parseConfig(
    configOrConstructor: ConfigOrConstructor,
    options: EnvironmentSettings,
    addressSuite: Record<string, string>
  ): Promise<ContractConfigurationWithId> {
    let newConfig = this._parsedConfigs.get(configOrConstructor);

    if (!newConfig) {
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

      newConfig = {
        ...(typeof config === 'string' ? {name: config} : config),
        id,
      };

      this._parsedConfigs.set(configOrConstructor, newConfig);
    }

    addressSuite[newConfig.id] = await this._getAddress(newConfig);

    return newConfig;
  }

  private async _factory<T extends ContractFactory = ContractFactory>(
    name: string
  ): Promise<T> {
    let factory = this._factories.get(name);
    if (factory) {
      return factory as T;
    }

    factory = await this.hre.ethers.getContractFactory(name);
    this._factories.set(name, factory);
    return factory as T;
  }

  private async _getAddress(config: ContractConfigurationWithId) {
    const factory = await this._factory(config.name);
    const deployer = await this.deployer;

    if ('proxy' in config) {
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
      path
        .join(this.hre.config.environment.path, '*.config.ts')
        .replace(/\\/g, '/')
    );

    this._dependencies = Promise.all(
      matches.map(async match => ({
        // eslint-disable-next-line node/no-unsupported-features/es-syntax
        imported: await import(path.join(match)),
        path: match,
      }))
    )
      .then(results =>
        results
          .map(({imported, path}) => {
            if (!imported.default) {
              console.error(
                `Config missing default export. ${path}.\nEach config should default export the DependencyConfig.`
              );
            }
            return imported.default;
          })
          .filter(Boolean)
      )
      .catch(e => {
        debug('failed fetching dependencies', e.message);
        return [];
      });

    return this._dependencies;
  }

  private async _loadDependencies(key?: keyof DetailedDependencies) {
    const dependencies = await this._fetchDependencies();
    const sortedConfigs: DependencyConfig[] = [];

    const getDeps = (config: DependencyConfig) => {
      if (Array.isArray(config.deps)) {
        return config.deps;
      }

      if (key !== undefined && config.deps?.[key]) {
        return config.deps[key]!;
      }

      return config.deps?.default || [];
    };

    const configs = new WeakMap<
      DependencyConfig,
      {remaining: DependencyConfig[]; dependers: DependencyConfig[]}
    >();

    dependencies.forEach(curConfig => {
      const deps = getDeps(curConfig);
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

  private _createRoleManager(configs: ContractConfigurationWithId[]) {
    const roles = new RoleManager();
    for (const config of configs) {
      const contract = this._contracts[config.id];
      if (!contract) {
        debug('missing contract for ' + config.id);
      }

      Object.values(config.roles || {}).forEach(role => {
        roles.register(role, contract);
      });
    }
    return roles;
  }

  private async _grantRoles() {
    const configs = await this.configs;
    const roles = await this._createRoleManager(configs);

    debug('granting roles...');

    for (const config of configs) {
      const contract = this._contracts[config.id];

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

  private async _loadConfigurations(key?: keyof DetailedDependencies) {
    const configs: ContractConfigurationWithId[] = [];
    const addressSuite: Record<string, string> = {};

    debug('loading config...');

    for (const {config} of await this._loadDependencies(key)) {
      try {
        configs.push(
          await this._parseConfig(
            config,
            this.hre.config.environment.settings,
            addressSuite
          )
        );
      } catch (e: any) {
        debug('failed to parse config: ', e.message);
      }
    }

    debug('loaded configuration', {configs, addressSuite});
    return {configs, addressSuite};
  }

  private async _deployConfigurations(registry: Registry) {
    const [configs, deployer] = await Promise.all([
      this.configs,
      this.deployer,
      this.addresses,
    ]);

    debug('deploying...');

    const constructorId = await registry.registerSettings(
      this.hre.config.environment.settings
    );

    for (const config of configs) {
      console.log('deploying', config.name);

      try {
        await this._deployContract(config, deployer, registry, constructorId);
      } catch (e: unknown) {
        console.error(
          'failed to deploy',
          config.name,
          ' - ',
          (e as Error).message
        );
      }
    }
  }

  private async _initialize(registry: Registry) {
    const [configs, addresses] = await Promise.all([
      this.configs,
      this.addresses,
    ]);

    debug('initializing...');

    const deploymentInfo = await registry.deploymentInfo(addresses);
    const constructorId = await registry.registerSettings(
      this.hre.config.environment.settings
    );

    const passing: Record<string, boolean> = {};

    for (const config of configs) {
      const contract = this._contracts[config.id];
      passing[config.id] = true;

      if (!contract) {
        console.error('missing contract for', config.name);
        passing[config.id] = false;
        continue;
      }

      debug('deployment info', config.name, deploymentInfo[config.id]);

      if (!deploymentInfo[config.id].initialized && config.initialize) {
        try {
          console.log('initializing', config.name);
          await config.initialize.call(await this._createContext(config));

          registry.setInitialized(contract.address, constructorId);

          if (config.initialized) {
            try {
              console.log('event initialized', config.name);
              await config.initialized.call(await this._createContext(config));
            } catch (e: any) {
              console.error(
                'event "initialized" failed for',
                config.name,
                '-',
                e.message
              );
            }
          }
        } catch (e: any) {
          passing[config.id] = false;
          console.error('failed initializing', config.name, '-', e.message, e);
        }
      }
    }

    return passing;
  }

  private async _configure(
    passing: Record<string, boolean>,
    registry: Registry
  ) {
    const [configs] = await Promise.all([this.configs]);
    debug('configuring...');

    const configureId = await registry.registerSettings(
      this.hre.config.environment.settings
    );

    for (const config of configs) {
      await this._configureContract(config, configureId, passing, registry);
    }
  }

  private async _finalize(passing: Record<string, boolean>) {
    const [configs] = await Promise.all([this.configs]);
    const deployer = await this.deployer;

    debug('finalizing...', passing);

    for (const config of configs) {
      if (config.finalize) {
        try {
          console.log('finalizing', config.name);
          await config.finalize.call(await this._createContext(config));
        } catch (e: any) {
          console.error('finalizing failed for', config.name, ' - ', e.message);
        }
      }
    }

    for (const config of configs) {
      const contract = this._contracts[config.id];

      if (!contract) {
        console.error('missing contract for', config.name);
        continue;
      }

      if (!passing[config.id]) continue;

      if ('proxy' in config && config.proxy.owner) {
        console.log('transferring ownership', config.name);
        await this._transferOwnership(
          deployer,
          contract.address,
          config.proxy.owner
        );
      }

      if (config.finalized) {
        try {
          console.log('event finalized', config.name);
          await config.finalized.call(await this._createContext(config));
        } catch (e: any) {
          console.error(
            'event finalized failed for',
            config.name,
            ' - ',
            e.message
          );
        }
      }
    }
  }

  private async _deployContract<T extends ContractFactory>(
    config: ContractConfigurationWithId<T>,
    deployer: Deployer,
    registry: Registry,
    constructorId: string
  ): Promise<ContractFromFactory<T>> {
    const factory: T = await this._factory(config.name);
    let contract: ContractFromFactory<T>;
    let address: string;

    if ('proxy' in config) {
      debug('deployment is a proxy');
      address = this._getProxyAddress(deployer, config);

      let options: DeployOptions | undefined;
      if (typeof config.deployOptions === 'function') {
        const {address: deploymentInfo} = await this.getDeploymentInfo({
          address,
        });
        options = await config.deployOptions(deploymentInfo);
      } else {
        options = config.deployOptions;
      }

      contract = await deployer.deploy<T>(factory, options);
    } else {
      contract = await deployer.deploy<T>(factory, config.deployOptions);
      address = contract.address;
    }

    await contract.deployed();
    await registry.setDeploymentInfo(contract, constructorId);

    if ('proxy' in config) {
      if (config.proxy.type === 'TransparentUpgradeableProxy') {
        let proxyAdmin = await this._getProxyAdmin(address);
        let safe: Safe | undefined;

        try {
          if (proxyAdmin) {
            const owner = await proxyAdmin.owner();
            const code = await proxyAdmin.provider.getCode(owner);

            // if there is a bytecode lets assume it is a proxy admin
            if (hexDataLength(code) > 0) {
              safe = await Safe.create({
                ethAdapter: new EthersAdapter({
                  ethers,
                  signerOrProvider: proxyAdmin.signer,
                }),
                safeAddress: owner,
              });
            } else if (
              !BigNumber.from(owner).eq(await proxyAdmin.signer.getAddress())
            ) {
              proxyAdmin = proxyAdmin.connect(
                await this.hre.ethers.getSigner(owner)
              );
            }
          }
        } catch (e: any) {
          console.error(
            'failed fetching the proxy admin details',
            address,
            proxyAdmin?.address,
            e.message
          );
        }

        contract = await deployer.templates.transparentUpgradeableProxy(
          config.proxy.id || config.id,
          contract,
          {
            ...(config.proxy.options || {}),
            multisig: safe,
            proxyAdmin: proxyAdmin || config.proxy.options?.proxyAdmin,
          }
        );
      } else if (config.proxy.type === 'UpgradeableBeacon') {
        contract = (await deployer.templates.upgradeableBeacon(
          config.proxy.id || config.id,
          config.proxy.options?.salt
        )) as any; // TODO to fix this because it is expecting to return the contract but should get upgradeable beacon
      } else {
        throw new Error('invalid proxy type "' + config.proxy['type'] + '"');
      }

      await registry.setDeploymentInfo(contract, constructorId);
    }

    this._contracts[config.id] = contract;

    if (contract.deployTransaction) {
      try {
        await config.deployed?.call(await this._createContext(config));
      } catch (e: any) {
        console.error(
          'event handler "deployed" failed for',
          config.name,
          ' - ',
          e.message
        );
      }
    }

    return contract;
  }

  private _getProxyAddress<T extends ContractFactory>(
    deployer: Deployer,
    config: ProxyConfiguration<T> & {id: string}
  ) {
    if (config.proxy.type === 'TransparentUpgradeableProxy') {
      return deployer.templates.transparentUpgradeableProxyAddress(
        config.proxy.id || config.id,
        config.proxy.options?.salt
      );
    } else if (config.proxy.type === 'UpgradeableBeacon') {
      return deployer.templates.upgradeableBeaconAddress(
        config.proxy.id || config.id,
        config.proxy.options?.salt
      );
    } else {
      throw new Error('invalid proxy type "' + config.proxy['type'] + '"');
    }
  }

  private async _transferOwnership(
    deployer: Deployer,
    address: string,
    newOwner: string
  ) {
    let contract = UpgradeableBeacon__factory.connect(
      (await this._getProxyAdmin(address))?.address || address,
      deployer.signer
    );

    let owner: string;
    try {
      owner = await contract.owner();
    } catch (e) {
      console.error('failed getting owner for ' + address);
      return;
    }

    if (BigNumber.from(owner).eq(newOwner)) {
      return;
    }

    const code = await deployer.provider.getCode(owner);

    let safe: Safe | undefined;
    if (hexDataLength(code) > 0) {
      safe = await Safe.create({
        safeAddress: owner,
        ethAdapter: new EthersAdapter({
          ethers,
          signerOrProvider: deployer.signer,
        }),
      });
    }

    try {
      if (safe) {
        await safe.createTransaction({
          safeTransactionData: {
            data: contract.interface.encodeFunctionData('transferOwnership', [
              newOwner,
            ]),
            to: contract.address,
            value: '0',
          },
        });
      } else {
        if (!BigNumber.from(owner).eq(await deployer.signer.getAddress())) {
          contract = contract.connect(await this.hre.ethers.getSigner(owner));
        }

        await contract.transferOwnership(newOwner).then(wait);
      }
    } catch (e: any) {
      console.error(
        'failed transfering ownership for ' +
          address +
          ' to ' +
          newOwner +
          '\n' +
          e.message
      );
    }
  }

  private async _getProxyAdmin(address: string) {
    try {
      const adminAddress = await getAdminAddress(
        this.hre.ethers.provider,
        address
      );

      if (!BigNumber.from(adminAddress).eq(0)) {
        return ProxyAdmin__factory.connect(
          adminAddress,
          (await this.deployer).signer
        );
      }
    } catch (e) {
      // do nothing
    }
    return undefined;
  }

  private async _createContext<T extends ContractFactory = ContractFactory>(
    config: ContractConfigurationWithId<T>
  ): Promise<CallbackContext<T>> {
    const [deployer, addresses, registry] = await Promise.all([
      this.deployer,
      this.addresses,
      Registry.from(this.deployer),
    ]);

    return {
      hre: this.hre,
      contracts: this._contracts,
      deployer,
      addresses,
      registry,
      config,
      settings: this._settings,
      configure: async () => {
        const configureId = await registry.registerSettings(
          this.hre.config.environment.settings
        );
        await this._configureContract(config, configureId, {}, registry);
      },
      deploy: async (): Promise<ContractFromFactory<T>> => {
        const constructorId = await registry.registerSettings(
          this.hre.config.environment.settings
        );

        console.log('deploying', config.name);
        return await this._deployContract(
          config,
          deployer,
          registry,
          constructorId
        );
      },
    };
  }

  private async _configureContract<T extends ContractFactory = ContractFactory>(
    config: ContractConfigurationWithId<T>,
    configureId: string,
    passing: Record<string, boolean>,
    registry: Registry
  ) {
    const contract = this._contracts[config.id];

    if (!contract) {
      console.error('missing contract for', config.name);
    }

    if (passing[config.id] && config.configure && contract) {
      try {
        console.log('configuring', config.name);
        await config.configure.call(await this._createContext(config));
        registry.setConfigured(contract.address, configureId);
        if (config.configured) {
          try {
            console.log('event configured', config.name);
            await config.configured.call(await this._createContext(config));
          } catch (e: any) {
            console.error(
              'event "configured" failed for',
              config.name,
              ' - ',
              e.message
            );
          }
        }
      } catch (e: any) {
        console.error('configure failed for', config.name, ' - ', e.message);
        passing[config.id] = false;
      }
    }
  }

  _updateSettings(newSettings: EnvironmentSettings) {
    this._settings = Object.freeze(JSON.parse(JSON.stringify(newSettings)));
  }

  private async _prepareSettings(
    stage: 'initialize' | 'configure' | 'finalize',
    passing?: Record<string, boolean>
  ) {
    const configs = await this.configs;
    debug('preparing settings for ' + stage, passing);

    for (const config of configs) {
      if (passing && !passing[config.id]) {
        continue;
      }

      try {
        let result: EnvironmentSettings | undefined;
        switch (stage) {
          case 'initialize':
            console.log('preparing ' + stage + ' for ' + config.name);
            result = await config.prepareInitialize?.call(
              await this._createContext(config)
            );
            break;
          case 'configure':
            console.log('preparing ' + stage + ' for ' + config.name);
            result = await config.prepareConfigure?.call(
              await this._createContext(config)
            );
            break;
          case 'finalize':
            console.log('preparing ' + stage + ' for ' + config.name);
            result = await config.prepareFinalize?.call(
              await this._createContext(config)
            );
            break;
        }

        if (result) this._updateSettings(result);
      } catch (e: any) {
        console.error('error preparing ' + stage, config.name, e.message);
        if (passing) delete passing[config.id];
      }
    }
  }
}
