import {SafeEthersSigner, SafeService} from '@safe-global/safe-ethers-adapters';
import EthersAdapter from '@safe-global/safe-ethers-lib';
import {ethers, Signer} from 'ethers';
import Safe from '@safe-global/protocol-kit';
import {Provider} from '@ethersproject/providers';

const SAFE_SERVICE_URL =
  process.env.SAFE_SERVICE_URL || 'https://safe-transaction-goerli.gnosis.io/';

export async function getSafeSigner(
  safeAddress: string,
  signerOrProvider: Signer | Provider
) {
  const service = new SafeService(SAFE_SERVICE_URL);
  const ethAdapter = new EthersAdapter({ethers, signerOrProvider});
  const safe = await Safe.create({
    ethAdapter,
    safeAddress,
  });
  return SafeEthersSigner.create(
    safe,
    service,
    signerOrProvider instanceof Provider
      ? signerOrProvider
      : signerOrProvider.provider
  );
}
