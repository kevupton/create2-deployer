import {ProxyAdmin__factory} from '../../../typechain-types/factories/contracts/proxy';
import {TemplateConfig} from './types';

export interface ProxyAdminDeployOptions {
  owner: string;
}

export const proxyAdminTemplate: TemplateConfig<
  ProxyAdmin__factory,
  ProxyAdminDeployOptions
> = {
  factory: ProxyAdmin__factory,
  createOptions({owner, calls = [], ...options}) {
    return {
      ...options,
      calls: [initializeProxyAdmin(owner), ...calls],
    };
  },
};

function initializeProxyAdmin(owner: string) {
  return ProxyAdmin__factory.createInterface().encodeFunctionData(
    'initialize',
    [owner]
  );
}
