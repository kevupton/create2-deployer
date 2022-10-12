import {Contract, ContractFactory} from 'ethers';
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
import {keccak256, toUtf8Bytes} from 'ethers/lib/utils';
import {wait} from '../utils/wait';
import {debug} from '../utils/log';

export class Environment {
  private readonly _dependencyConfigs: DependencyConfig[] = [];

  constructor(public readonly deployer: Deployer) {}

  register<T extends ContractFactory = ContractFactory>(
    configOrConstructor: ConfigOrConstructor<T>,
    deps: number[] = []
  ) {
    return this._dependencyConfigs.push({
      configOrConstructor: configOrConstructor,
      deps,
    });
  }

  async getAddresses(options: ConstructorOptions) {
    const addressSuite: Record<string, string> = {};

    for (const {configOrConstructor} of this._loadDependencies()) {
      await this._parseConfig(configOrConstructor, options, addressSuite);
    }

    return addressSuite as AddressValues<ContractSuite>;
  }

  async upgrade(
    deployer: Deployer,
    options: ConstructorOptions,
    configuration: ConfigureOptions
  ) {
    const registry = await Registry.from(deployer);
    const [constructorId, configurationId] = await registry.registerOptions(
      options,
      configuration
    );
    const contracts = new Map<ContractConfiguration, Contract>();
    const factories = new Map<ContractConfiguration, ContractFactory>();
    const addressSuite: Record<string, string> = {};
    const contractSuite: Record<string, Contract> = {};
    const assignRole: Record<symbol, (account: string) => Promise<void>> = {};
    const configs: (ContractConfiguration & {id: string})[] = [];

    for (const {configOrConstructor} of this._loadDependencies()) {
      const config = await this._parseConfig(
        configOrConstructor,
        options,
        addressSuite
      );

      config.roles?.forEach(role => {
        if (!role.description)
          throw new Error('invalid role symbol. missing description.');

        const roleId = keccak256(toUtf8Bytes(role.description));

        assignRole[role] = async (account: string) => {
          const contract = contracts.get(config);

          if (!contract) {
            throw new Error('missing contract for' + config.name);
          }

          if (!(await contract.hasRole(roleId, account))) {
            await contract.grantRole(roleId, account).then(wait);
          }
        };
      });

      configs.push(config);
    }

    debug('address suite', addressSuite);

    const network = await deployer.provider.getNetwork();
    const deploymentInfo = await registry.deploymentInfo(
      network.chainId,
      addressSuite
    );

    debug('deployment info', deploymentInfo);

    for (const config of configs) {
      console.log('deploying', config.name);

      try {
        const factory = factories.get(config)!;
        let contract = await deployer.deploy(factory, config.deployOptions);

        await contract.deployed();
        await registry.recordDeploymentInfo(contract);

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

        contracts.set(config, contract);
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

    for (const config of configs) {
      const contract = contracts.get(config);

      if (!contract) {
        console.error('missing contract for', config.name);
      }

      if (config.requiredRoles && contract) {
        try {
          console.log('granting-roles', config.name);
          for (const requiredRole of config.requiredRoles) {
            if (typeof requiredRole === 'symbol') {
              await assignRole[requiredRole](contract.address);
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

    const initialized: Record<string, boolean> = {};
    const canConfigure: Record<string, boolean> = {};
    for (const config of configs) {
      const id = camel(config.name) as keyof ContractSuite;
      const contract = contracts.get(config);

      if (!contract) {
        console.error('missing contract for', config.name);
      }

      if (!deploymentInfo[id].initialized && config.initialize && contract) {
        try {
          console.log('initializing', config.name);
          await config.initialize(contractSuite, options, configuration);
          initialized[id] = true;

          deploymentInfo[id].initialized = true;
          deploymentInfo[id].initializeOptions = constructorId;
          if (!contract.deployTransaction) {
            registry.addCall('initialized', [
              network.chainId,
              contract.address,
              constructorId,
            ]);
          }

          canConfigure[id] = true;
        } catch (e: any) {
          console.error('failed initializing', config.name, '-', e.message, e);
        }
      } else {
        canConfigure[id] = true;
      }
    }

    for (const config of configs) {
      const id = camel(config.name) as keyof ContractSuite;
      if (initialized[id] && config.initialized) {
        try {
          console.log('event initialized', config.name);
          await config.initialized(contractSuite);
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

    for (const config of configs) {
      const id = camel(config.name) as keyof ContractSuite;
      if (canConfigure[id] && config.prepareConfig) {
        try {
          console.log('preparing config', config.name);
          configuration = await config.prepareConfig(
            contractSuite,
            configuration
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

    const configured: Record<string, boolean> = {};
    for (const config of configs) {
      const id = camel(config.name) as keyof ContractSuite;
      const contract = contracts.get(config);

      if (!contract) {
        console.error('missing contract for', config.name);
      }

      if (canConfigure[id] && config.configure && contract) {
        try {
          console.log('configuring', config.name);
          await config.configure(contractSuite, configuration, options);
          configured[id] = true;

          if (!contract.deployTransaction) {
            registry.addCall('configured', [
              network.chainId,
              contract.address,
              configurationId,
            ]);
          } else {
            deploymentInfo[id].lastConfigureOptions = configurationId;
          }
        } catch (e: any) {
          console.error('configure failed for', config.name, ' - ', e.message);
        }
      }
    }

    for (const config of configs) {
      const id = camel(config.name) as keyof ContractSuite;
      if (configured[id] && config.configured) {
        try {
          console.log('event configured', config.name);
          await config.configured(contractSuite);
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

    for (const config of configs) {
      const id = camel(config.name) as keyof ContractSuite;
      const contract = contracts.get(config);

      if (!contract) {
        console.error('missing contract for', config.name);
      }

      if (contract?.deployTransaction) {
        registry.addCall('register', [
          network.chainId,
          contract.address,
          deploymentInfo[id],
        ]);
      }
    }

    await registry.executeCalls();

    return contractSuite as ContractSuite;
  }

  private async _parseConfig(
    configOrConstructor: ConfigOrConstructor,
    options: ConstructorOptions,
    addressSuite: Record<string, string>
  ): Promise<ContractConfiguration & {id: string}> {
    const config =
      typeof configOrConstructor === 'function'
        ? await configOrConstructor(options, addressSuite)
        : configOrConstructor;

    const id = config.id ?? camel(config.name);

    const factory = await ethers.getContractFactory(
      config.name,
      this.deployer.signer
    );

    let address: string;
    if (config.proxy) {
      switch (config.proxy.type) {
        case 'TransparentUpgradeableProxy':
          address = this.deployer.templates.transparentUpgradeableProxyAddress(
            config.proxy.id || id,
            config.proxy.options?.salt
          );
          break;
        case 'UpgradeableBeacon':
          address = this.deployer.templates.upgradeableBeaconAddress(
            config.proxy.id || id,
            config.proxy.options?.salt
          );
          break;
      }
    } else {
      address = this.deployer.factoryAddress(factory, {
        args: config.deployOptions?.args,
      });
    }

    addressSuite[id] = address;

    return {
      ...config,
      id,
    };
  }

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

    this._dependencyConfigs.forEach((curConfig, i) => {
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
          sortedConfigs.push(this._dependencyConfigs[depender - 1]);
        }
      });

      ids.delete(curDep);
    }

    if (sortedConfigs.length !== this._dependencyConfigs.length) {
      throw new Error('Missing Dependencies');
    }

    return sortedConfigs;
  }
}
