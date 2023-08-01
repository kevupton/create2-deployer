import {Signer} from 'ethers';
import {Provider} from '@ethersproject/providers';
import {FireblocksSDK} from 'fireblocks-sdk';
import {FireblocksSigner} from 'ethers-fireblocks';

export async function getFireblocksSigner(
  fireblocks: FireblocksSDK,
  signerOrProvider: Signer | Provider
) {
  const provider =
    signerOrProvider instanceof Provider
      ? signerOrProvider
      : signerOrProvider.provider;
  if (!provider) {
    throw new Error('missing provider from signerOrProvider');
  }
  return new FireblocksSigner(fireblocks, provider);
}
