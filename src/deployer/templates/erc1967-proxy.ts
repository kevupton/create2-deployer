import {ERC1967Proxy__factory} from '../../proxy';
import {TemplateConfig} from './types';
import {BytesLike} from 'ethers';
import {PromiseOrValue} from '../../../typechain-types/common';
import {PLACEHOLDER_ADDRESS} from '../constants';

export interface ERC1967ProxyDeployOptions {
  logic: PromiseOrValue<string>;
  data?: PromiseOrValue<BytesLike>;
}

export const erc1967Template: TemplateConfig<
  ERC1967Proxy__factory,
  ERC1967ProxyDeployOptions
> = {
  factory: ERC1967Proxy__factory,
  demoData: {
    logic: PLACEHOLDER_ADDRESS,
  },
  createOptions({logic, data = '0x', calls = [], ...options}) {
    return {
      ...options,
      args: [logic, data],
      calls: [...calls],
    };
  },
};
