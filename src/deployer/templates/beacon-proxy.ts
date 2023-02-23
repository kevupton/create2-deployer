import {BeaconProxy__factory} from '../../../typechain-types/factories/contracts/proxy';
import {TemplateConfig} from './types';
import {BytesLike} from 'ethers';
import {PromiseOrValue} from '../../../typechain-types/common';

export interface BeaconProxyDeployOptions {
  beacon: PromiseOrValue<string>;
  data?: PromiseOrValue<BytesLike>;
}

export const beaconProxyTemplate: TemplateConfig<
  BeaconProxy__factory,
  BeaconProxyDeployOptions
> = {
  factory: BeaconProxy__factory,
  createOptions({beacon, data, calls = [], ...options}) {
    return {
      ...options,
      calls: [initializeBeaconProxy(beacon, data), ...calls],
    };
  },
};

function initializeBeaconProxy(
  beacon: PromiseOrValue<string>,
  data: PromiseOrValue<BytesLike> = '0x'
) {
  return BeaconProxy__factory.createInterface().encodeFunctionData(
    'initialize',
    [beacon, data]
  );
}
