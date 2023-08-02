import {ContractTransaction, Signer} from 'ethers';
import {GasReportContext, gasReporter} from './gas-reporter';
import {TransactionReceipt} from '@ethersproject/providers';
import {isMultiSigSigner} from '../deployer';
import {debug} from './log';

export async function wait(
  tx: ContractTransaction,
  context?: GasReportContext,
  signer?: Signer
) {
  if (signer && isMultiSigSigner(signer)) {
    debug('skipping waiting for multisig transaction');
    console.log('sent multisig tx to be signed: ' + tx.hash);
    return;
  }

  const confirmations = process.env.CONFIRMATIONS
    ? parseInt(process.env.CONFIRMATIONS, 10)
    : undefined;

  if (confirmations === 0) {
    await wait.onTransaction(tx);
    return;
  }

  const [, receipt] = await Promise.all([
    wait.onTransaction(tx),
    tx.wait(confirmations),
  ]);

  gasReporter.report(receipt, context);
  await wait.onReceipt(receipt);

  return receipt;
}

wait.withContext = (context: GasReportContext, signer?: Signer) => {
  return (tx: ContractTransaction) => wait(tx, context, signer);
};

wait.onTransaction = (tx: ContractTransaction) => Promise.resolve();
wait.onReceipt = (receipt: TransactionReceipt) => Promise.resolve();
