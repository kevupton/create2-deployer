import {SafeEthersSigner, SafeService} from '@safe-global/safe-ethers-adapters';
import {ethers, Signer} from 'ethers';
import Safe, {EthersAdapter} from '@safe-global/protocol-kit';
import {Provider} from '@ethersproject/providers';

export async function getSafeSigner(
  safeAddress: string,
  signerOrProvider: Signer | Provider
) {
  const service = new SafeService(
    process.env.SAFE_SERVICE_URL ||
      'https://safe-transaction-mainnet.safe.global/'
  );
  const ethAdapter = new EthersAdapter({
    ethers,
    signerOrProvider,
  });
  const safe = await Safe.create({
    ethAdapter: ethAdapter as any,
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
