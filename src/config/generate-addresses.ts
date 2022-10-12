import {Deployer} from '../utils';
import {AddressValues, ConstructorOptions, ContractSuite} from './types';
import {camel} from 'case';
import {ethers} from 'hardhat';
import {Configuration} from './configuration';

export async function generateAddresses(
  deployer: Deployer,
  options: ConstructorOptions
) {
  const addressSuite: Record<string, string> = {};

  for (const {config} of Configuration.load()) {
    const resultConfig =
      typeof config === 'function'
        ? await config(options, addressSuite)
        : config;
    const id = camel(resultConfig.name);
    const factory = await ethers.getContractFactory(
      resultConfig.name,
      deployer.signer
    );

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

    addressSuite[id as keyof ContractSuite] = address;
  }

  return addressSuite as AddressValues<ContractSuite>;
}
