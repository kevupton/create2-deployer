import {
  BigNumber,
  BigNumberish,
  BytesLike,
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
  getAddress,
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
import {
  getAdminAddress,
  getImplementationAddress,
} from '@openzeppelin/upgrades-core';
import {ContractFactoryType, FactoryInstance} from '../deployer/types';
import {verify, VerifyOptions} from './verify';

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

  reload() {
    this._parsedConfigs.clear();
    this._factories.clear();
    this._ready = this._prepareConfigurations();
  }

  async verify(maxAsync = 3) {
    const addresses = await this.addresses;
    const configs = await this._sortConfigurations();

    let verifyCommands: Promise<any>[] = [];

    for (const config of configs) {
      const address = addresses[config.id];

      if (!address) {
        continue;
      }

      const verifyOptions: VerifyOptions = {address, noCompile: true};

      if ('proxy' in config) {
        console.log('verifying ' + config.id + ' proxy at ' + address);
        const implementation = await getImplementationAddress(
          this.hre.ethers.provider,
          address
        );

        const options = await (typeof config.deployOptions === 'function'
          ? config.deployOptions({
              address,
              deployed: true,
            })
          : config.deployOptions);

        verifyOptions.constructorArguments = options?.args;
        verifyOptions.address = implementation;
      } else {
        console.log('verifying ' + config.id + ' at ' + address);
        verifyOptions.constructorArguments = config.deployOptions?.args;
      }

      verifyCommands.push(verify(this.hre, verifyOptions));

      if (verifyCommands.length >= maxAsync) {
        await Promise.all(verifyCommands);
        verifyCommands = [];
      }
    }

    await Promise.all(verifyCommands);
  }

  async configure() {
    const configs = await this._sortConfigurations('configure');
    await this._prepareSettings(configs, 'configure');
    await this._configure(configs);

    this._checkErrors();
  }
  async upgrade() {
    const addresses = await this.addresses;

    debug('address suite', addresses);
    this._contracts = {};
    this._errors = [];

    let configs = await this._sortConfigurations('deploy');
    await this._deployConfigurations(configs);
    await this._grantRoles(configs);

    configs = await this._sortConfigurations('initialize');
    await this._prepareSettings(configs, 'initialize');
    await this._initialize(configs);

    configs = await this._sortConfigurations('configure');
    await this._prepareSettings(configs, 'configure');
    await this._configure(configs);

    configs = await this._sortConfigurations('finalize');
    await this._prepareSettings(configs, 'finalize');
    await this._finalize(configs);

    this._checkErrors();

    return this.contracts as ContractSuite;
  }

  async getSigner(address: string, defaultSigner?: Signer) {
    const deployer = await this.deployer;
    const code = await deployer.provider.getCode(address);
    defaultSigner = defaultSigner ?? deployer.signer;

    address = getAddress(address);

    if (BigNumber.from(address).eq(deployer.signer.address)) {
      debug('using deployer signer: ' + address);
      return deployer.signer;
    }

    if (BigNumber.from(address).eq(await defaultSigner.getAddress())) {
      debug('using default signer: ' + address);
      return defaultSigner;
    }

    if (hexDataLength(code) > 0) {
      debug('using gnosis safe signer: ' + address);
      return await getSafeSigner(address, defaultSigner);
    }

    debug('attempting to get signer through hardhat: ' + address);
    return await this.hre.ethers.getSigner(address);
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

  private async _createRoleManager(configs: ContractConfigurationWithId[]) {
    const roles = new RoleManager();
    for (const config of configs) {
      let contract = this._contracts[config.id];
      if (!contract) {
        debug('missing contract for ' + config.id);
        continue;
      }

      if (!config.roles && !config.roleAdmin) {
        continue;
      }

      let roleAdmin: BytesLike | Signer | undefined;
      if (typeof config.roleAdmin === 'function') {
        roleAdmin = await config.roleAdmin.call(
          await this._createContext(config),
          contract
        );
      }

      if (isBytesLike(roleAdmin) && hexDataLength(roleAdmin) === 20) {
        roleAdmin = await this.getSigner(hexlify(roleAdmin), contract.signer);
      } else {
        roleAdmin = undefined;
      }

      if (roleAdmin) {
        contract = contract.connect(roleAdmin);
      }

      roles.registerConfig(config, contract);

      Object.values(config.roles || {}).forEach(role => {
        roles.registerRole(role, contract);
      });
    }

    for (const config of configs) {
      const target = this._contracts[config.id];
      if (!target) {
        debug('missing contract for ' + config.id);
        this._registerError({
          id: config.id,
          error: new Error('missing contract'),
          details: 'grant roles failed',
        });
        continue;
      }
      if (!this._canProgress(config.id)) {
        continue;
      }

      config.requiredRoles?.forEach(request => {
        let contract: Contract;
        let role: string;
        if (typeof request === 'symbol') {
          contract = roles.getContractByRole(request);
          role = roles.getRoleIdFromSymbol(request);
        } else {
          contract = roles.getContractByConfig(
            request.config.config as ContractConfigurationWithId
          );
          role = request.role;
        }

        roles.group(contract, role, target.address);
      });
    }

    return roles;
  }

  private async _grantRoles(configs: ContractConfigurationWithId[]) {
    const roles = await this._createRoleManager(configs);

    debug('granting roles...');

    try {
      await roles.grantAll();
    } catch (e) {
      this._registerError({
        error: e,
        details: 'grant all roles failed',
      });
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

  private async _deployConfigurations(configs: ContractConfigurationWithId[]) {
    const [deployer] = await Promise.all([this.deployer]);

    debug('deploying...');

    for (const config of configs) {
      console.log('deploying', config.id);

      try {
        const contract = await this._deployContract(config, deployer);
        if (!contract.deployTransaction) {
          debug('already deployed');
        }
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

  private async _initialize(configs: ContractConfigurationWithId[]) {
    debug('initializing...');

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

      const {CREATE2_FORCE_INITIALIZE} = process.env;
      if (
        (contract.deployTransaction ||
          (CREATE2_FORCE_INITIALIZE &&
            (CREATE2_FORCE_INITIALIZE === '*' ||
              CREATE2_FORCE_INITIALIZE.includes(config.id)))) &&
        config.initialize
      ) {
        try {
          console.log('initializing', config.id);
          await config.initialize.call(await this._createContext(config));

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

  private async _configure(configs: ContractConfigurationWithId[]) {
    debug('configuring...');

    for (const config of configs) {
      await this._configureContract(config);
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
          this._registerError({
            id: config.id,
            error: e,
            details: 'finalize failed',
          });
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
          config.id,
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
    deployer: Deployer
  ): Promise<FactoryInstance<T>> {
    const factory: T = await this._factory(config.contract);
    let contract: FactoryInstance<T>;
    let address: string | undefined;
    let options: DeployOptions<T> | undefined;

    if ('proxy' in config) {
      debug('deployment is a proxy');

      if (typeof config.deployOptions === 'function') {
        address = this._getProxyAddress(deployer, config);
        debug('proxy address ' + address);
        const code = await deployer.provider.getCode(address);
        options = await config.deployOptions.call(this._createContext(config), {
          address,
          deployed: hexDataLength(code) > 0,
        });
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

    if (!address) {
      address = contract.address;
    }

    await contract.deployed();

    if ('proxy' in config) {
      let signer: Signer | undefined;
      if (config.proxy.type === 'TransparentUpgradeableProxy') {
        debug('is TransparentUpgradeableProxy');

        let proxyAdmin = await this._getProxyAdmin(address, deployer);

        try {
          if (proxyAdmin) {
            debug('detected existing proxy admin');

            const proxyAdminOwner = await proxyAdmin.owner();

            debug('proxy admin owner: ' + proxyAdminOwner);

            // if there is a bytecode lets assume it is a gnosis safe signer
            if (config.proxy.owner instanceof Signer) {
              signer = config.proxy.owner;
              debug(
                'using custom specified signer to upgrade ' +
                  (await config.proxy.owner.getAddress())
              );
            } else {
              signer = await this.getSigner(proxyAdminOwner, proxyAdmin.signer);
            }

            if (signer) {
              proxyAdmin = proxyAdmin.connect(signer);
              debug('connected proxy admin to signer');
            }
          } else {
            debug('could not detect existing proxy admin');
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
          salt: this._generateSalt(
            deployer,
            config.proxy.id || config.id,
            config.proxy.salt
          ),
          overrides: config.proxy.overrides,
          implementation: contract,
          signer,
          initialize: config.proxy.initialize,
          upgrade: config.proxy.upgrade,
          proxyAdmin: proxyAdmin ?? {
            id: config.proxy.proxyAdmin as string | undefined,
            salt: this._generateSalt(
              deployer,
              config.proxy.proxyAdmin?.toString(),
              config.proxy.salt
            ),
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
          salt: this._generateSalt(
            deployer,
            config.proxy.id || config.id,
            config.proxy.salt
          ),
        }); // TODO to fix this because it is expecting to return the contract but should get upgradeable beacon
      } else {
        throw new Error('invalid proxy type "' + config.proxy['type'] + '"');
      }
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
        salt: this._generateSalt(
          deployer,
          config.proxy.id || config.id,
          config.proxy.salt
        ),
      });
    } else if (config.proxy.type === 'UpgradeableBeacon') {
      return getTemplateAddress(deployer, 'UpgradeableBeacon', {
        id: config.proxy.id || config.id,
        salt: this._generateSalt(
          deployer,
          config.proxy.id || config.id,
          config.proxy.salt
        ),
      });
    } else {
      throw new Error('invalid proxy type "' + config.proxy['type'] + '"');
    }
  }

  private async _transferOwnership(
    id: string,
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

        await contract.transferOwnership(newOwner).then(
          wait.withContext({
            name: id,
            address,
            action: 'transferOwnership',
          })
        );
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

      debug(address + ' admin address ' + adminAddress);

      if (!BigNumber.from(adminAddress).eq(0)) {
        return ProxyAdmin__factory.connect(adminAddress, deployer.signer);
      }
    } catch (e) {
      console.log(e);
      // do nothing
    }
    return undefined;
  }

  private async _createContext<T extends ContractFactory = ContractFactory>(
    config: ContractConfigurationWithId<T>
  ): Promise<CallbackContext<T>> {
    const [deployer, addresses] = await Promise.all([
      this.deployer,
      this.addresses,
    ]);

    return {
      hre: this.hre,
      contracts: this._contracts,
      deployer,
      addresses,
      config,
      settings: this._settings,
      configure: async () => {
        debug('configuring', config.id);
        await this._configureContract(config);
      },
      deploy: async (): Promise<FactoryInstance<T>> => {
        debug('deploying', config.id);
        return await this._deployContract(config, deployer);
      },
    };
  }

  private async _configureContract<T extends ContractFactory = ContractFactory>(
    config: ContractConfigurationWithId<T>
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

  private _generateSalt(deployer: Deployer, id?: string, salt?: BigNumberish) {
    return keccak256(
      hexConcat([
        id ? toUtf8Bytes(id) : '0x',
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

    const message = (error as any)?.message || error?.toString() || `${error}`;
    const errorString = `${error.id ? `[${error.id}] ` : ''}${
      error.details
    }. ${message}`;
    debug(errorString);

    this._errors.push(error);
  }
}
