import {BeaconProxy__factory} from '../../proxy';
import {TemplateConfig} from './types';
import {BytesLike} from 'ethers';
import {PLACEHOLDER_ADDRESS} from '../constants';
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
  demoData: {
    beacon: PLACEHOLDER_ADDRESS,
  },
  createOptions({beacon, data = '0x', calls = [], ...options}) {
    return {
      ...options,
      args: [beacon, data],
      calls: [...calls],
    };
  },
};
