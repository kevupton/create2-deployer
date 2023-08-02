import {Signer} from 'ethers';
import {SafeEthersSigner} from '@safe-global/safe-ethers-adapters';
import {FireblocksSigner} from 'ethers-fireblocks';

export function isSafeSigner(signer: Signer) {
  return (
    signer instanceof SafeEthersSigner || signer instanceof FireblocksSigner
  );
}
