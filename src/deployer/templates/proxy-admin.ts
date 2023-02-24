import {ProxyAdmin__factory} from '../../proxy';
import {TemplateConfig} from './types';
import {PLACEHOLDER_ADDRESS} from '../constants';

export interface ProxyAdminDeployOptions {
  owner: string;
}

export const proxyAdminTemplate: TemplateConfig<
  ProxyAdmin__factory,
  ProxyAdminDeployOptions
> = {
  factory: ProxyAdmin__factory,
  demoData: {
    owner: PLACEHOLDER_ADDRESS,
  },
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
