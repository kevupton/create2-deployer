import {Signer} from 'ethers';
import {Create2Deployer__factory} from '../../typechain-types/factories/Create2Deployer__factory';
import {hexDataLength} from 'ethers/lib/utils';

export const CREATE2_DEPLOYER_ADDRESS =
  '0x4275F0C060Ebe50272f1e483d0E144F83c31d910';

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
