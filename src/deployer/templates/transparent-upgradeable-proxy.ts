import {TransparentUpgradeableProxy__factory} from '../../proxy';
import {TemplateConfig} from './types';
import {BytesLike} from 'ethers';
import {PromiseOrValue} from '../../../typechain-types/common';
import {PLACEHOLDER_ADDRESS} from '../constants';

export interface TransparentUpgradeableProxyDeployOptions {
  logic: PromiseOrValue<string>;
  admin: PromiseOrValue<string>;
  data?: PromiseOrValue<BytesLike>;
}

export const transparentUpgradeableProxyTemplate: TemplateConfig<
  TransparentUpgradeableProxy__factory,
  TransparentUpgradeableProxyDeployOptions
> = {
  factory: TransparentUpgradeableProxy__factory,
  demoData: {
    logic: PLACEHOLDER_ADDRESS,
    admin: PLACEHOLDER_ADDRESS,
  },
  createOptions({logic, admin, data = '0x', calls = [], ...options}) {
    return {
      ...options,
      args: [logic, admin, data],
      calls: [...calls],
    };
  },
};
