import {UpgradeableBeacon__factory} from '../../../typechain-types/factories/contracts/proxy';
import {TemplateConfig} from './types';
import {PromiseOrValue} from '../../../typechain-types/common';

export interface UpgradeableBeaconDeployOptions {
  implementation: PromiseOrValue<string>;
  owner: PromiseOrValue<string>;
}

export const upgradeableBeaconTemplate: TemplateConfig<
  UpgradeableBeacon__factory,
  UpgradeableBeaconDeployOptions
> = {
  factory: UpgradeableBeacon__factory,
  createOptions({implementation, owner, calls = [], ...options}) {
    return {
      ...options,
      calls: [initializeUpgradeableBeacon(implementation, owner), ...calls],
    };
  },
};

function initializeUpgradeableBeacon(
  implementation: PromiseOrValue<string>,
  owner: PromiseOrValue<string>
) {
  return UpgradeableBeacon__factory.createInterface().encodeFunctionData(
    'initialize',
    [implementation, owner]
  );
}
