import {TransparentUpgradeableProxy__factory} from '../../../typechain-types/factories/contracts/proxy';
import {TemplateConfig} from './types';
import {BytesLike} from 'ethers';
import {PromiseOrValue} from '../../../typechain-types/common';

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
  createOptions({logic, admin, data, calls = [], ...options}) {
    return {
      ...options,
      calls: [
        initializeTransparentUpgradeableProxy(logic, admin, data),
        ...calls,
      ],
    };
  },
};

function initializeTransparentUpgradeableProxy(
  logic: PromiseOrValue<string>,
  admin: PromiseOrValue<string>,
  data: PromiseOrValue<BytesLike> = '0x'
) {
  return TransparentUpgradeableProxy__factory.createInterface().encodeFunctionData(
    'initialize',
    [logic, admin, data]
  );
}
