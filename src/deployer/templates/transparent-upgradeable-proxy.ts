import {TransparentUpgradeableProxy__factory} from '../../proxy';
import {TemplateConfig} from './types';
import {BytesLike} from 'ethers';
import {PromiseOrValue} from '../../../typechain-types/common';
import {PLACEHOLDER_ADDRESS} from '../constants';
import {placeholderCall} from '../helpers/placeholder-call';

export interface TransparentUpgradeableProxyDeployOptions {
  logic: PromiseOrValue<string>;
  admin: PromiseOrValue<string>;
  data?: PromiseOrValue<BytesLike>;
}

export const transparentUpgradeableProxyTemplate: TemplateConfig<
  TransparentUpgradeableProxy__factory,
  TransparentUpgradeableProxyDeployOptions
> = {
  Factory: TransparentUpgradeableProxy__factory,
  args: [PLACEHOLDER_ADDRESS, PLACEHOLDER_ADDRESS, '0x'],
  createOptions({logic, admin, data, calls = [], args, target, ...options}) {
    return {
      ...options,
      args,
      calls: [
        upgradeToAndCall(target, logic, data),
        changeAdmin(target, admin),
        ...calls,
      ],
    };
  },
};

function upgradeToAndCall(
  target: string,
  logic: PromiseOrValue<string>,
  data?: PromiseOrValue<BytesLike>
) {
  const int = TransparentUpgradeableProxy__factory.createInterface();
  data = data
    ? int.encodeFunctionData('upgradeToAndCall', [logic, data])
    : int.encodeFunctionData('upgradeTo', [logic]);
  return placeholderCall(target, data);
}

function changeAdmin(target: string, account: PromiseOrValue<string>) {
  return placeholderCall(
    target,
    TransparentUpgradeableProxy__factory.createInterface().encodeFunctionData(
      'changeAdmin',
      [account]
    )
  );
}
