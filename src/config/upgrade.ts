import {Deployer} from '../utils';
import {
  ConfigureOptions,
  ConstructorOptions,
  ContractConfiguration,
  ContractSuite,
} from './types';
import {Contract, ContractFactory} from 'ethers';
import {camel} from 'case';
import {ethers} from 'hardhat';
import {keccak256, toUtf8Bytes} from 'ethers/lib/utils';
import {Registry} from './registry';
import {Configuration} from './configuration';
import {wait} from '../utils/wait';

export async function upgrade(
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
  const contractSuite: Record<string, Contract> = {} as any;
  const rolesMapping: Record<symbol, (account: string) => Promise<void>> = {};
  const configs: ContractConfiguration[] = [];

  for (const {config} of Configuration.load()) {
    const resultConfig =
      typeof config === 'function'
        ? await config(options, addressSuite)
        : config;

    const id = camel(resultConfig.name) as keyof ContractSuite;
    const factory = await ethers.getContractFactory(
      resultConfig.name,
      deployer.signer
    );

    factories.set(resultConfig, factory);
    let address: string;
    if (resultConfig.proxy) {
      switch (resultConfig.proxy.type) {
        case 'TransparentUpgradeableProxy':
          address = deployer.templates.transparentUpgradeableProxyAddress(
            resultConfig.proxy.id || resultConfig.name,
            resultConfig.proxy.options?.salt
          );
      }
    } else {
      address = deployer.factoryAddress(factory, {
        args: resultConfig.deployOptions?.args,
      });
    }

    addressSuite[id] = address;

    if (resultConfig.roles) {
      Object.getOwnPropertySymbols(resultConfig.roles).forEach(role => {
        rolesMapping[role] = async (account: string) => {
          const contract = contracts.get(resultConfig);
          const roleId = keccak256(toUtf8Bytes(resultConfig.roles![role]));

          if (!contract) {
            console.error('missing contract for', config.name);
          } else if (!(await contract.hasRole(roleId, account))) {
            await contract.grantRole(roleId, account).then(wait);
          }
        };
      });
    }

    configs.push(resultConfig);
  }

  const network = await deployer.provider.getNetwork();
  const deploymentInfo = await registry.deploymentInfo(
    network.chainId,
    addressSuite
  );
  const registryCalls: string[] = [];

  console.log('address suite');
  console.log(addressSuite);

  for (const config of configs) {
    const id = camel(config.name) as keyof ContractSuite;
    console.log('deploying', config.name);

    try {
      const factory = factories.get(config)!;
      let contract = await deployer.deploy(factory, config.deployOptions);
      await contract.deployed();

      if (contract.deployTransaction) {
        const tx = await deployer.provider.getTransaction(
          contract.deployTransaction.hash
        );
        if (!tx.blockNumber) {
          throw new Error('missing block number from deploy transaction');
        }
        const block = await deployer.provider.getBlock(tx.blockNumber);
        deploymentInfo[id].hash = contract.deployTransaction.hash;
        deploymentInfo[id].block = block.number;
        deploymentInfo[id].timestamp = block.timestamp;
        deploymentInfo[id].constructOptions = constructorId;
        deploymentInfo[id].owner = deployer.signer.address;
      }

      if (config.proxy) {
        switch (config.proxy.type) {
          case 'TransparentUpgradeableProxy':
            contract = await deployer.templates.transparentUpgradeableProxy(
              config.proxy.id || config.name,
              contract,
              config.proxy.options
            );
            break;
        }
      }

      contractSuite[id] = contract;

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
            await rolesMapping[requiredRole](contract.address);
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
        console.error('prepareConfig failed for', config.name, '-', e.message);
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
