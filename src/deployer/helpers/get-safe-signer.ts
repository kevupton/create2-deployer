import {SafeEthersSigner, SafeService} from '@safe-global/safe-ethers-adapters';
import EthersAdapter from '@safe-global/safe-ethers-lib';
import {ethers, Signer} from 'ethers';
import Safe from '@safe-global/safe-core-sdk';
import {Provider} from '@ethersproject/providers';

const SAFE_SERVICE_URL =
  process.env.SAFE_SERVICE_URL || 'https://safe-transaction.goerli.gnosis.io/';

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
  return new SafeEthersSigner(
    safe,
    service,
    signerOrProvider instanceof Provider
      ? signerOrProvider
      : signerOrProvider.provider
  );
  // const contract = new Contract(
  //   '0xe50c6391a6cb10f9B9Ef599aa1C68C82dD88Bd91',
  //   ['function pin(string newMessage)'],
  //   safeSigner
  // );
  // const proposedTx = await contract.functions.pin(
  //   `Local time: ${new Date().toLocaleString()}`
  // );
  // console.log('USER ACTION REQUIRED');
  // console.log('Go to the Safe Web App to confirm the transaction');
  // console.log(await proposedTx.wait());
  // console.log('Transaction has been executed');
}
