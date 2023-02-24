import {Deployer} from '../deployer';
import {PromiseOrValue} from '../../../typechain-types/common';
import {ProxyAdmin} from '../../proxy';
import {deployTemplate} from './deploy-template';
import {TemplateCreateOptions} from '../templates';

export type GetProxyAdminOptions = PromiseOrValue<
  ProxyAdmin | string | Partial<TemplateCreateOptions<'ProxyAdmin'>>
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
