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
  Factory: UpgradeableBeacon__factory,
  args: [PLACEHOLDER_ADDRESS],
  createOptions({implementation, owner, calls = [], ...options}) {
    return {
      ...options,
      calls: [upgradeTo(implementation), transferOwnership(owner), ...calls],
    };
  },
};

function upgradeTo(implementation: PromiseOrValue<string>) {
  return UpgradeableBeacon__factory.createInterface().encodeFunctionData(
    'upgradeTo',
    [implementation]
  );
}

function transferOwnership(owner: PromiseOrValue<string>) {
  return UpgradeableBeacon__factory.createInterface().encodeFunctionData(
    'transferOwnership',
    [owner]
  );
}
