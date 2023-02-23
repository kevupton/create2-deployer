import {Deployer} from '../deployer';
import {deployTemplate, TemplateOptions} from '../templates';
import {PromiseOrValue} from '../../../typechain-types/common';
import {ProxyAdmin} from '../../../typechain-types/contracts/proxy';

export type GetProxyAdminOptions = PromiseOrValue<
  ProxyAdmin | string | Partial<TemplateOptions<'ProxyAdmin'>>
>;

export const getProxyAdmin = async (
  deployer: Deployer,
  options?: GetProxyAdminOptions
) => {
  options = await options;

  if (!options) {
    options = {};
  } else if (typeof options === 'string') {
    // then proxy admin is the salt of the proxy admin
    options = {id: options};
  }

  const proxyAdmin =
    'address' in options
      ? options
      : await deployTemplate(deployer, 'ProxyAdmin', {
          id: deployer.signer.address,
          owner: deployer.signer.address,
          ...options,
        });

  await proxyAdmin.deployed();
  return proxyAdmin;
};
