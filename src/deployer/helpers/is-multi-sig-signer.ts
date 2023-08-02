import {Signer} from 'ethers';
import {SafeEthersSigner} from '@safe-global/safe-ethers-adapters';
import {FireblocksSigner} from 'ethers-fireblocks';

export function isMultiSigSigner(signer: Signer) {
  return (
    signer instanceof SafeEthersSigner || signer instanceof FireblocksSigner
  );
}
