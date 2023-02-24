import {BytesLike} from 'ethers';
import {defaultAbiCoder} from 'ethers/lib/utils';
import {Create2Deployer} from '../../../typechain-types';
import {PLACEHOLDER_ADDRESS} from '../constants';

export function placeholderCall(
  target: string,
  data: BytesLike = '0x'
): Create2Deployer.FunctionCallStruct {
  return {
    target: PLACEHOLDER_ADDRESS,
    data: defaultAbiCoder.encode(['address', 'data'], [target, data]),
  };
}
