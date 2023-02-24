import {Contract} from 'ethers';
import {Interface} from '@ethersproject/abi';
import {defaultAbiCoder, hexConcat, isHexString} from 'ethers/lib/utils';
import {debug} from '../../utils';

export type FunctionName<T extends Contract> =
  keyof T['interface']['functions'];

export interface FunctionCall<T extends Contract> {
  id: FunctionName<T>;
  args: ReadonlyArray<unknown>;
}

export type FunctionCallOptions<T extends Contract = Contract> =
  | FunctionCall<T>
  | FunctionName<T>;

export function encodeFunctionCall<T extends Contract>(
  int: Interface,
  call?: FunctionCallOptions<T>
) {
  debug('encodeFunctionCall', call);

  if (!call) {
    return '0x';
  }

  if (typeof call === 'string' && isHexString(call)) {
    return call;
  }

  call = typeof call !== 'object' ? {id: call, args: []} : call;

  const fn = int.functions[call.id.toString()];
  return hexConcat([
    int.getSighash(fn),
    defaultAbiCoder.encode(
      fn.inputs.map(input => input.type),
      call.args || []
    ),
  ]);
}
