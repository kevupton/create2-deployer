import {Contract, Signer} from 'ethers';
import {debug} from '../../utils';
import {Deployer, DeployTemplateOptions} from '../deployer';
import {
  getImplementation,
  GetImplementationOptions,
} from './get-implementation';
import {deployTemplate} from './deploy-template';
import {upgradeUpgradeableBeaconProxy} from './upgrade-upgradeable-beacon-proxy';

export type DeployUpgradeableBeaconOptions<T extends Contract> =
  DeployTemplateOptions & {
    owner?: string;
    implementation: GetImplementationOptions<T>;
    signer?: Signer;
  };

export const deployUpgradeableBeaconProxy = async <T extends Contract>(
  deployer: Deployer,
  {
    owner,
    implementation,
    signer,
    id,
    salt,
    overrides,
  }: DeployUpgradeableBeaconOptions<T>
) => {
  implementation = await getImplementation(deployer, implementation);

  // deploy the proxy, or retrieve the proxy instance if it is already deployed.
  debug('deploying proxy, UpgradeableBeacon');
  const proxy = await deployTemplate(deployer, 'UpgradeableBeacon', {
    implementation: implementation.address,
    owner: owner || deployer.signer.address,
    id,
    salt,
    overrides,
  });
  await proxy.deployed();

  // upgrade the proxy if we need to
  await upgradeUpgradeableBeaconProxy(deployer, {
    beacon: proxy,
    implementation,
    signer,
  });

  const result = implementation.attach(proxy.address) as T;

  Object.defineProperty(result, 'deployTransaction', {
    writable: false,
    value: proxy.deployTransaction,
  });

  if (!proxy.deployTransaction) {
    result._deployedPromise = Promise.resolve(result);
  }

  return result;
};
