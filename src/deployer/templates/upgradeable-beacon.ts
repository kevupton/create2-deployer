import {UpgradeableBeacon__factory} from '../../proxy';
import {TemplateConfig} from './types';
import {PromiseOrValue} from '../../../typechain-types/common';
import {PLACEHOLDER_ADDRESS} from '../constants';

export interface UpgradeableBeaconDeployOptions {
  implementation: PromiseOrValue<string>;
  owner: PromiseOrValue<string>;
}

export const upgradeableBeaconTemplate: TemplateConfig<
  UpgradeableBeacon__factory,
  UpgradeableBeaconDeployOptions
> = {
  factory: UpgradeableBeacon__factory,
  demoData: {
    implementation: PLACEHOLDER_ADDRESS,
    owner: PLACEHOLDER_ADDRESS,
  },
  createOptions({implementation, owner, calls = [], ...options}) {
    return {
      ...options,
      args: [implementation],
      calls: [transferOwnership(owner), ...calls],
    };
  },
};

function transferOwnership(owner: PromiseOrValue<string>) {
  return UpgradeableBeacon__factory.createInterface().encodeFunctionData(
    'transferOwnership',
    [owner]
  );
}
