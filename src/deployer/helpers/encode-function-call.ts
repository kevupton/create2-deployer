import {Contract} from 'ethers';
import {Interface} from '@ethersproject/abi';
import {defaultAbiCoder, hexConcat} from 'ethers/lib/utils';

export type FunctionName<T extends Contract> =
  keyof T['interface']['functions'];

export interface FunctionCall<T extends Contract> {
  id: FunctionName<T>;
  args: ReadonlyArray<unknown>;
}

export type FunctionCallOptions<T extends Contract> =
  | FunctionCall<T>
  | FunctionName<T>;

export function encodeFunctionCall<T extends Contract>(
  int: Interface,
  call?: FunctionCallOptions<T>
) {
  if (!call) {
    return '0x';
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
