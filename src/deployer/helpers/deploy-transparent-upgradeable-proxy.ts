import {Contract, Signer} from 'ethers';
import {debug} from '../../utils';
import {Deployer, DeployTemplateOptions} from '../deployer';
import {getProxyAdmin, GetProxyAdminOptions} from './get-proxy-admin';
import {upgradeTransparentUpgradeableProxy} from './upgrade-transparent-upgradeable-proxy';
import {
  getImplementation,
  GetImplementationOptions,
} from './get-implementation';
import {encodeFunctionCall, FunctionCallOptions} from './encode-function-call';
import {deployTemplate} from './deploy-template';

export type TransparentUpgradeableProxyHelperOptions<T extends Contract> =
  DeployTemplateOptions & {
    implementation: GetImplementationOptions<T>;
    proxyAdmin?: GetProxyAdminOptions;
    upgrade?: FunctionCallOptions<T>;
    initialize?: FunctionCallOptions<T>;
    signer?: Signer;
  };

export const deployTransparentUpgradeableProxy = async <T extends Contract>(
  deployer: Deployer,
  {
    proxyAdmin,
    implementation,
    initialize,
    upgrade,
    signer,
    id,
    salt,
    overrides,
  }: TransparentUpgradeableProxyHelperOptions<T>
) => {
  proxyAdmin = await getProxyAdmin(deployer, proxyAdmin);
  implementation = await getImplementation(deployer, implementation);

  // deploy the proxy, or retrieve the proxy instance if it is already deployed.
  debug('deploying proxy');
  debug('proxy admin address', proxyAdmin.address);
  debug('implementation address', implementation.address);
  const proxy = await deployTemplate(deployer, 'TransparentUpgradeableProxy', {
    logic: implementation.address,
    admin: proxyAdmin.address,
    data: encodeFunctionCall(implementation.interface, initialize),
    id,
    salt,
    overrides,
  });
  await proxy.deployed();

  debug('deployed proxy address', proxy.address);

  // upgrade the proxy if we need to
  await upgradeTransparentUpgradeableProxy(deployer, {
    proxy,
    proxyAdmin,
    implementation,
    signer,
    call: upgrade,
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
