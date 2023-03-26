import {
  BigNumber,
  BigNumberish,
  Contract,
  ContractFactory,
  ethers,
  Signer,
} from 'ethers';
import {
  CallbackContext,
  ConfigOrConstructor,
  ContractConfigurationWithId,
  ContractSuite,
  DependencyConfig,
  DependencyConfigLoaded,
  DetailedDependencies,
  EnvironmentSettings,
  ProxyConfiguration,
} from './types';
import {camel} from 'case';
import {Registry} from './registry';
import {debug, gasReporter, wait} from '../utils';
import {RoleManager} from './role-manager';
import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {glob} from 'glob';
import path from 'path';
import {
  Deployer,
  DeployOptions,
  deployTransparentUpgradeableProxy,
  deployUpgradeableBeaconProxy,
  getSafeSigner,
  getTemplateAddress,
} from '../deployer';
import {
  hexConcat,
  hexDataLength,
  hexlify,
  isBytesLike,
  keccak256,
  toUtf8Bytes,
} from 'ethers/lib/utils';
import Safe from '@safe-global/safe-core-sdk';
import EthersAdapter from '@safe-global/safe-ethers-lib';
import {ProxyAdmin__factory, UpgradeableBeacon__factory} from '../proxy';
import {getAdminAddress} from '@openzeppelin/upgrades-core';
import {ContractFactoryType, FactoryInstance} from '../deployer/types';

export interface ErrorDetails {
  id?: string;
  error: any;
  details: string;
  context?: Record<string, unknown>;
  stopProgression?: boolean;
}

export class Environment {
  public readonly deployer = (process.env.DEPLOYER
    ? this.hre.ethers.getSigner(process.env.DEPLOYER)
    : this.hre.ethers.getSigners().then(signers => signers[0])
  ).then(signer => new Deployer(signer));

  private _dependencies: Promise<DependencyConfig[]> | undefined;
  private _ready: Promise<{
    addressSuite: Record<string, string>;
    dependencies: DependencyConfigLoaded[];
  }>;
  private _factories = new Map<string, Promise<ContractFactory>>();
  private _parsedConfigs = new Map<
    ConfigOrConstructor,
    ContractConfigurationWithId
  >();
  private _contracts: Record<string, Contract> = {};
  private _settings: EnvironmentSettings;
  private _errors: ErrorDetails[] = [];

  constructor(public readonly hre: HardhatRuntimeEnvironment) {
    this._ready = this._prepareConfigurations();
    this._settings = this.hre.config.environment.settings;
  }

  get gasReporter() {
    return gasReporter;
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

  get dependencies() {
    return this._ready.then(val => val.dependencies);
  }

  get registry() {
    return Registry.from(this.deployer);
  }

  reload() {
    this._parsedConfigs.clear();
    this._factories.clear();
    this._ready = this._prepareConfigurations();
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
    this._errors = [];

    let configs = await this._sortConfigurations('deploy');
    await this._deployConfigurations(configs, registry);
    await this._grantRoles(configs);

    configs = await this._sortConfigurations('initialize');
    await this._prepareSettings(configs, 'initialize');
    await this._initialize(configs, registry);

    configs = await this._sortConfigurations('configure');
    await this._prepareSettings(configs, 'configure');
    await this._configure(configs, registry);

    await registry.sync();

    configs = await this._sortConfigurations('finalize');
    await this._prepareSettings(configs, 'finalize');
    await this._finalize(configs);

    this._checkErrors();

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
        typeof configOrConstructor === 'function' &&
        !('getContract' in configOrConstructor)
          ? await configOrConstructor(options, addressSuite)
          : configOrConstructor;

      const contract =
        typeof config === 'string'
          ? config
          : typeof config === 'function'
          ? config
          : config.contract;

      const defaultId =
        typeof contract === 'string'
          ? camel(contract)
          : camel(contract.name.replace('__factory', ''));

      const id =
        typeof config === 'object' ? config.id ?? defaultId : defaultId;

      if (addressSuite[id]) {
        throw new Error('duplicate id ' + id);
      }

      newConfig = {
        ...(typeof config === 'object' ? config : {}),
        contract,
        id,
      };

      this._parsedConfigs.set(configOrConstructor, newConfig);
    }

    addressSuite[newConfig.id] = await this._getAddress(newConfig);

    return newConfig;
  }

  private async _factory<T extends ContractFactory = ContractFactory>(
    contractOrName: string | ContractFactoryType
  ): Promise<T> {
    const name =
      typeof contractOrName === 'string'
        ? contractOrName
        : contractOrName.name.replace('__factory', '');

    let factory = this._factories.get(name);
    if (factory) {
      return factory as Promise<T>;
    }

    factory = (async () => {
      if (typeof contractOrName === 'string') {
        return await this.hre.ethers.getContractFactory(name);
      } else {
        const deployer = await this.deployer;
        return new contractOrName(deployer.signer);
      }
    })();

    this._factories.set(name, factory);
    return factory as Promise<T>;
  }

  private async _getAddress(config: ContractConfigurationWithId) {
    const factory = await this._factory(config.contract);
    const deployer = await this.deployer;

    if ('proxy' in config) {
      return this._getProxyAddress(deployer, config);
    }

    return deployer.factoryAddress(factory, {
      args: config.deployOptions?.args,
      salt: this._generateSalt(
        deployer,
        config.deployOptions?.id || config.id,
        config.deployOptions?.salt
      ),
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

  private async _sortConfigurations(key?: keyof DetailedDependencies) {
    const {dependencies} = await this._ready;

    return this._sortDependencies(dependencies, key)
      .map(({config}) => config)
      .filter(config => {
        return this._canProgress(config.id);
      });
  }

  private _sortDependencies<
    T extends DependencyConfig | DependencyConfigLoaded
  >(dependencies: T[], key?: keyof DetailedDependencies) {
    const sortedDeps: T[] = [];

    const getDeps = (config: T) => {
      if (Array.isArray(config.deps)) {
        return config.deps as T[];
      }

      if (key !== undefined && config.deps?.[key]) {
        return config.deps[key]! as T[];
      }

      return (config.deps?.default || []) as T[];
    };

    const tempConfigs = new WeakMap<T, {remaining: T[]; dependers: T[]}>();

    dependencies.forEach(curConfig => {
      const deps = getDeps(curConfig);
      const config = {
        dependers: tempConfigs.get(curConfig)?.dependers || [],
        remaining: deps.concat(),
      };
      if (deps.length > 0) {
        deps.forEach(dep => {
          tempConfigs.set(
            dep,
            tempConfigs.get(dep) || {
              dependers: [],
              remaining: [],
            }
          );
          tempConfigs.get(dep)!.dependers.push(curConfig);
        });
      } else {
        sortedDeps.push(curConfig);
      }
      tempConfigs.set(curConfig, config);
    });

    for (let i = 0; i < sortedDeps.length; i++) {
      const curDep = sortedDeps[i];
      const config = tempConfigs.get(curDep)!;

      config.dependers.forEach(depender => {
        const dependerConfig = tempConfigs.get(depender)!;
        const index = dependerConfig.remaining.indexOf(curDep);
        if (index >= 0) dependerConfig.remaining.splice(index, 1);
        if (dependerConfig.remaining.length === 0) {
          sortedDeps.push(depender);
        }
      });
    }

    if (sortedDeps.length !== dependencies.length) {
      throw new Error('Missing Dependencies');
    }

    return sortedDeps;
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

  private async _grantRoles(configs: ContractConfigurationWithId[]) {
    const roles = await this._createRoleManager(configs);

    debug('granting roles...');

    for (const config of configs) {
      if (!this._canProgress(config.id)) {
        continue;
      }

      const contract = this._contracts[config.id];
      if (!contract) {
        console.error('missing contract for', config.id);
        this._registerError({
          id: config.id,
          error: new Error('missing contract'),
          details: 'grant roles failed',
        });
        continue;
      }

      debug('checking', config.id, !!config.requiredRoles);
      if (config.requiredRoles && contract) {
        try {
          console.log('granting-roles', config.id);
          for (const requiredRole of config.requiredRoles) {
            if (typeof requiredRole === 'symbol') {
              await roles.grant(requiredRole, contract.address);
            } else {
              await requiredRole(contract.address);
            }
          }
        } catch (e: any) {
          // TODO add context to the rolesMapping
          console.log('failed grant role for', config.id);
          this._registerError({
            id: config.id,
            error: e,
            details: 'grant roles failed',
          });
        }
      }
    }
  }

  private async _prepareConfigurations() {
    const addressSuite: Record<string, string> = {};
    const dependencies = await this._fetchDependencies();

    debug('loading configs...');
    for (const dependency of this._sortDependencies(dependencies, 'address')) {
      dependency.config = await this._parseConfig(
        dependency.config,
        this.hre.config.environment.settings,
        addressSuite
      );
    }

    debug('loaded configuration', addressSuite);
    return {
      dependencies: dependencies as DependencyConfigLoaded[],
      addressSuite,
    };
  }

  private async _deployConfigurations(
    configs: ContractConfigurationWithId[],
    registry: Registry
  ) {
    const [deployer] = await Promise.all([this.deployer]);

    debug('deploying...');

    const constructorId = await registry.registerSettings(
      this.hre.config.environment.settings
    );

    for (const config of configs) {
      console.log('deploying', config.id);

      try {
        await this._deployContract(config, deployer, registry, constructorId);
      } catch (e: any) {
        console.error('failed to deploy', config.id);
        this._registerError({
          id: config.id,
          error: e,
          details: 'deployment failed',
          stopProgression: true,
        });
      }
    }
  }

  private async _initialize(
    configs: ContractConfigurationWithId[],
    registry: Registry
  ) {
    const [addresses] = await Promise.all([this.addresses]);

    debug('initializing...');

    const deploymentInfo = await registry.deploymentInfo(addresses);
    const constructorId = await registry.registerSettings(
      this.hre.config.environment.settings
    );

    for (const config of configs) {
      const contract = this._contracts[config.id];

      if (!contract) {
        console.error('missing contract for', config.id);
        this._registerError({
          id: config.id,
          error: new Error('missing contract'),
          details: 'initialize failed',
        });
        continue;
      }

      if (config.initialize)
        debug('deployment info', config.id, deploymentInfo[config.id]);

      if (!deploymentInfo[config.id].initialized && config.initialize) {
        try {
          console.log('initializing', config.id);
          await config.initialize.call(await this._createContext(config));

          registry.setInitialized(contract.address, constructorId);

          if (config.initialized) {
            try {
              console.log('event initialized', config.id);
              await config.initialized.call(await this._createContext(config));
            } catch (e: any) {
              console.error('event "initialized" failed for', config.id);
              this._registerError({
                id: config.id,
                error: e,
                details: 'initialized event failed',
              });
            }
          }
        } catch (e: any) {
          console.error('failed initializing', config.id);
          this._registerError({
            id: config.id,
            error: e,
            details: 'initialize failed',
            stopProgression: true,
          });
        }
      }
    }
  }

  private async _configure(
    configs: ContractConfigurationWithId[],
    registry: Registry
  ) {
    debug('configuring...');

    const configureId = await registry.registerSettings(
      this.hre.config.environment.settings
    );

    for (const config of configs) {
      await this._configureContract(config, configureId, registry);
    }
  }

  private async _finalize(configs: ContractConfigurationWithId[]) {
    const deployer = await this.deployer;

    debug('finalizing...');

    for (const config of configs) {
      if (config.finalize) {
        try {
          console.log('finalizing', config.id);
          await config.finalize.call(await this._createContext(config));
        } catch (e: any) {
          console.error('finalizing failed for', config.id, ' - ', e.message);
          debug('stack:', e.stack);
        }
      }
    }

    for (const config of configs) {
      const contract = this._contracts[config.id];

      if (!contract) {
        console.error('missing contract for', config.id);
        continue;
      }

      if (!this._canProgress(config.id)) continue;

      if ('proxy' in config && config.proxy.owner) {
        console.log('transferring ownership', config.id);
        await this._transferOwnership(
          deployer,
          contract.address,
          config.proxy.owner
        );
      }

      if (config.finalized) {
        try {
          console.log('event finalized', config.id);
          await config.finalized.call(await this._createContext(config));
        } catch (e: any) {
          console.error('event finalized failed for ', config.id);
          this._registerError({
            id: config.id,
            error: e,
            details: 'finalized event failed',
          });
        }
      }
    }
  }

  private async _deployContract<T extends ContractFactory>(
    config: ContractConfigurationWithId<T>,
    deployer: Deployer,
    registry: Registry,
    constructorId: string
  ): Promise<FactoryInstance<T>> {
    const factory: T = await this._factory(config.contract);
    let contract: FactoryInstance<T>;
    let address: string;
    let options: DeployOptions<T> | undefined;

    if ('proxy' in config) {
      if (typeof config.deployOptions === 'function') {
        address = this._getProxyAddress(deployer, config);
        const {address: deploymentInfo} = await this.getDeploymentInfo({
          address,
        });
        options = await config.deployOptions(deploymentInfo);
      } else {
        // to keep typescript happy
        options = config.deployOptions;
      }
    } else {
      options = config.deployOptions;
    }

    contract = await deployer.deploy<T>(factory, {
      ...(options || {}),
      salt: this._generateSalt(
        deployer,
        options?.id || config.id,
        options?.salt
      ),
    });
    address = contract.address;

    await contract.deployed();
    await registry.setDeploymentInfo(contract, constructorId);

    if ('proxy' in config) {
      debug('deployment is a proxy');
      let signer: Signer | undefined;
      if (config.proxy.type === 'TransparentUpgradeableProxy') {
        let proxyAdmin = await this._getProxyAdmin(address, deployer);

        try {
          if (proxyAdmin) {
            const proxyAdminOwner = await proxyAdmin.owner();
            const code = await proxyAdmin.provider.getCode(proxyAdminOwner);

            // if there is a bytecode lets assume it is a gnosis safe signer
            if (config.proxy.owner instanceof Signer) {
              signer = config.proxy.owner;
            } else if (hexDataLength(code) > 0) {
              signer = await getSafeSigner(proxyAdminOwner, proxyAdmin.signer);
            } else if (
              !BigNumber.from(proxyAdminOwner).eq(deployer.signer.address)
            ) {
              signer = await this.hre.ethers.getSigner(proxyAdminOwner);
            }

            if (signer) {
              proxyAdmin = proxyAdmin.connect(signer);
            }
          }
        } catch (e: any) {
          console.error(
            'failed fetching the proxy admin details',
            address,
            proxyAdmin?.address,
            e.message
          );
          debug('stack:', e.stack);
        }

        if (
          isBytesLike(config.proxy.proxyAdmin) &&
          hexDataLength(config.proxy.proxyAdmin) === 20
        ) {
          proxyAdmin = ProxyAdmin__factory.connect(
            hexlify(config.proxy.proxyAdmin),
            deployer.signer
          );
        }

        contract = await deployTransparentUpgradeableProxy(deployer, {
          id: config.proxy.id || config.id,
          salt: config.proxy.salt,
          overrides: config.proxy.overrides,
          implementation: contract,
          signer,
          initialize: config.proxy.initialize,
          upgrade: config.proxy.upgrade,
          proxyAdmin: proxyAdmin ?? {
            id: config.proxy.proxyAdmin as string | undefined,
            salt: config.proxy.salt,
          },
        });
      } else if (config.proxy.type === 'UpgradeableBeacon') {
        try {
          const owner = await UpgradeableBeacon__factory.connect(
            address,
            deployer.signer
          ).owner();
          const code = await deployer.provider.getCode(owner);

          // if there is a bytecode lets assume it is a proxy admin
          if (hexDataLength(code) > 0) {
            signer = await getSafeSigner(owner, deployer.signer);
          } else if (
            !BigNumber.from(owner).eq(await deployer.signer.getAddress())
          ) {
            signer = await this.hre.ethers.getSigner(owner);
          }
        } catch (e: any) {
          console.error(
            'failed getting signer for upgradeable beacon',
            address,
            e.message
          );
          debug('stack:', e.stack);
        }

        contract = await deployUpgradeableBeaconProxy(deployer, {
          implementation: contract,
          signer,
          owner: await this.getAddress(
            config.proxy.owner,
            deployer.signer.address
          ),
          id: config.proxy.id || config.id,
          salt: config.proxy.salt,
        }); // TODO to fix this because it is expecting to return the contract but should get upgradeable beacon
      } else {
        throw new Error('invalid proxy type "' + config.proxy['type'] + '"');
      }

      await registry.setDeploymentInfo(contract, constructorId);
    }

    this._contracts[config.id] = contract;

    // if (contract.deployTransaction) {
    try {
      await config.deployed?.call(await this._createContext(config));
    } catch (e: any) {
      console.error(
        'event handler "deployed" failed for',
        config.id,
        ' - ',
        e.message
      );
      debug('stack:', e.stack);
    }
    // }

    return contract;
  }

  async getAddress(...owners: (string | ethers.Signer | undefined)[]) {
    for (const owner of owners) {
      if (typeof owner === 'string') return owner;
      if (owner) return await owner.getAddress();
    }
    throw new Error('Failed to get address');
  }

  private _getProxyAddress<T extends ContractFactory>(
    deployer: Deployer,
    config: ProxyConfiguration<T> & {id: string}
  ) {
    if (config.proxy.type === 'TransparentUpgradeableProxy') {
      return getTemplateAddress(deployer, 'TransparentUpgradeableProxy', {
        id: config.proxy.id || config.id,
        salt: config.proxy.salt,
      });
    } else if (config.proxy.type === 'UpgradeableBeacon') {
      return getTemplateAddress(deployer, 'UpgradeableBeacon', {
        id: config.proxy.id || config.id,
        salt: config.proxy.salt,
      });
    } else {
      throw new Error('invalid proxy type "' + config.proxy['type'] + '"');
    }
  }

  private async _transferOwnership(
    deployer: Deployer,
    address: string,
    newOwner: string | Signer
  ) {
    newOwner = await this.getAddress(newOwner);

    let contract = UpgradeableBeacon__factory.connect(
      (await this._getProxyAdmin(address, deployer))?.address || address,
      deployer.signer
    );

    let owner: string;
    try {
      owner = await contract.owner();
    } catch (e: any) {
      console.error('failed getting owner for ' + address);
      debug('stack:', e.stack);
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
      debug('stack:', e.stack);
    }
  }

  private async _getProxyAdmin(address: string, deployer: Deployer) {
    try {
      const adminAddress = await getAdminAddress(
        this.hre.ethers.provider,
        address
      );

      if (!BigNumber.from(adminAddress).eq(0)) {
        return ProxyAdmin__factory.connect(adminAddress, deployer.signer);
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
        await this._configureContract(config, configureId, registry);
      },
      deploy: async (): Promise<FactoryInstance<T>> => {
        const constructorId = await registry.registerSettings(
          this.hre.config.environment.settings
        );

        console.log('deploying', config.id);
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
    registry: Registry
  ) {
    const contract = this._contracts[config.id];

    if (!contract) {
      console.error('missing contract for', config.id);
    }

    if (!this._canProgress(config.id) || !config.configure || !contract) {
      return;
    }

    try {
      console.log('configuring', config.id);
      await config.configure.call(await this._createContext(config));
      registry.setConfigured(contract.address, configureId);
      if (config.configured) {
        try {
          console.log('event configured', config.id);
          await config.configured.call(await this._createContext(config));
        } catch (e: any) {
          console.error('event "configured" failed for', config.id);
          this._registerError({
            id: config.id,
            details: 'configure event failed',
            error: e,
          });
        }
      }
    } catch (e: any) {
      console.error('configure failed for', config.id);
      this._registerError({
        id: config.id,
        details: 'configure failed',
        error: e,
        stopProgression: true,
      });
    }
  }

  _updateSettings(newSettings: EnvironmentSettings) {
    this._settings = Object.freeze(JSON.parse(JSON.stringify(newSettings)));
  }

  private async _prepareSettings(
    configs: ContractConfigurationWithId[],
    stage: 'initialize' | 'configure' | 'finalize'
  ) {
    debug('preparing settings for ' + stage);

    for (const config of configs) {
      if (!this._canProgress(config.id)) {
        continue;
      }

      try {
        let result: EnvironmentSettings | undefined;
        switch (stage) {
          case 'initialize':
            console.log('preparing ' + stage + ' for ' + config.id);
            result = await config.prepareInitialize?.call(
              await this._createContext(config)
            );
            break;
          case 'configure':
            console.log('preparing ' + stage + ' for ' + config.id);
            result = await config.prepareConfigure?.call(
              await this._createContext(config)
            );
            break;
          case 'finalize':
            console.log('preparing ' + stage + ' for ' + config.id);
            result = await config.prepareFinalize?.call(
              await this._createContext(config)
            );
            break;
        }

        if (result) this._updateSettings(result);
      } catch (e: any) {
        console.error('error preparing ' + stage, config.id, e.message);
        this._registerError({
          id: config.id,
          details: 'prepare settings for ' + stage,
          error: e,
          stopProgression: true,
        });
      }
    }
  }

  private _generateSalt(deployer: Deployer, id: string, salt?: BigNumberish) {
    return keccak256(
      hexConcat([
        toUtf8Bytes(id),
        BigNumber.from(salt || deployer.defaultSalt).toHexString(),
      ])
    );
  }

  private _canProgress(id: string) {
    return !this._errors?.some(
      error => error.id === id && error.stopProgression
    );
  }

  private _checkErrors() {
    const errors: string[] = [];
    this._errors.reverse().forEach(({details, error, context, id}) => {
      const message = error?.message || error?.toString() || `${error}`;
      const errorString = `${id ? `[${id}] ` : ''}${details}. ${message}`;
      console.error(errorString, context);
      console.error(error);
      errors.push(errorString);
    });
    if (errors.length > 0) {
      throw new Error('[UPGRADE FAILED]\n' + errors.join('\n'));
    }
  }

  private _registerError(error: ErrorDetails) {
    if (process.env.FAIL_ON_ERROR) {
      console.error(error);
      throw error.error;
    }

    this._errors.push(error);
  }
}
