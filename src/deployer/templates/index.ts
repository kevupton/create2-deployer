import {Deployer, FactoryAddressOptions} from '../deployer';
import {beaconProxyTemplate} from './beacon-proxy';
import {erc1967Template} from './erc1967-proxy';
import {proxyAdminTemplate} from './proxy-admin';
import {transparentUpgradeableProxyTemplate} from './transparent-upgradeable-proxy';
import {upgradeableBeaconTemplate} from './upgradeable-beacon';
import {ContractFromFactory} from '../types';

const templates = {
  BeaconProxy: beaconProxyTemplate,
  ERC1967Proxy: erc1967Template,
  ProxyAdmin: proxyAdminTemplate,
  TransparentUpgradeableProxy: transparentUpgradeableProxyTemplate,
  UpgradeableBeacon: upgradeableBeaconTemplate,
};

export type TemplatesRecord = typeof templates;
export type TemplateID = keyof TemplatesRecord;
export type TemplateOptions<K extends TemplateID> = Parameters<
  TemplatesRecord[K]['createOptions']
>[0];

export const deployTemplate = async <K extends TemplateID>(
  deployer: Deployer,
  id: K,
  options: TemplateOptions<K>
): Promise<
  ContractFromFactory<InstanceType<TemplatesRecord[K]['factory']>>
> => {
  const config = templates[id];
  const factory = new config.factory();
  const contract = await deployer.deployTemplateFromFactory(
    factory,
    config.createOptions(options as any)
  );
  await contract.deployed();
  return contract as any;
};

export const getTemplateAddress = <K extends TemplateID>(
  deployer: Deployer,
  id: K,
  options?: FactoryAddressOptions<InstanceType<TemplatesRecord[K]['factory']>>
) => {
  const factory = new templates[id].factory();
  return deployer.factoryAddress(factory, options);
};
