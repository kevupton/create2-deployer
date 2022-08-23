import {Signer} from 'ethers';
import {Create2Deployer__factory} from '../../typechain-types';
import {hexDataLength} from 'ethers/lib/utils';

export const CREATE2_DEPLOYER_ADDRESS =
  '0x45A1A1a7d02436e0D83a15E177a551F4e8B3a33c';

export async function getCreate2Deployer(signer: Signer) {
  if (!signer.provider) {
    throw new Error('Signer missing provider');
  }

  const code = await signer.provider.getCode(CREATE2_DEPLOYER_ADDRESS);

  if (!hexDataLength(code)) {
    throw new Error('Create2 deployer not deployed on this network yet.');
  }

  return Create2Deployer__factory.connect(CREATE2_DEPLOYER_ADDRESS, signer);
}
