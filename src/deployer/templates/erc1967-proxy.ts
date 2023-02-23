import {ERC1967Proxy__factory} from '../../../typechain-types/factories/contracts/proxy';
import {TemplateConfig} from './types';
import {BytesLike} from 'ethers';
import {PromiseOrValue} from '../../../typechain-types/common';

export interface ERC1967ProxyDeployOptions {
  logic: PromiseOrValue<string>;
  data?: PromiseOrValue<BytesLike>;
}

export const erc1967Template: TemplateConfig<
  ERC1967Proxy__factory,
  ERC1967ProxyDeployOptions
> = {
  factory: ERC1967Proxy__factory,
  createOptions({logic, data, calls = [], ...options}) {
    return {
      ...options,
      calls: [initializeERC1967Proxy(logic, data), ...calls],
    };
  },
};

function initializeERC1967Proxy(
  logic: PromiseOrValue<string>,
  data: PromiseOrValue<BytesLike> = '0x'
) {
  return ERC1967Proxy__factory.createInterface().encodeFunctionData(
    'initialize',
    [logic, data]
  );
}
