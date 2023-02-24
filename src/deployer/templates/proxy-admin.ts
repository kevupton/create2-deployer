import {ProxyAdmin__factory} from '../../proxy';
import {TemplateConfig} from './types';

export interface ProxyAdminDeployOptions {
  owner: string;
}

export const proxyAdminTemplate: TemplateConfig<
  ProxyAdmin__factory,
  ProxyAdminDeployOptions
> = {
  Factory: ProxyAdmin__factory,
  createOptions({owner, calls = [], ...options}) {
    return {
      ...options,
      calls: [transferOwnership(owner), ...calls],
    };
  },
};

function transferOwnership(owner: string) {
  return ProxyAdmin__factory.createInterface().encodeFunctionData(
    'transferOwnership',
    [owner]
  );
}
