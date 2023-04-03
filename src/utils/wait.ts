import {ContractTransaction} from 'ethers';
import {GasReportContext, gasReporter} from './gas-reporter';
import {TransactionReceipt} from '@ethersproject/providers';

export async function wait(
  tx: ContractTransaction,
  context?: GasReportContext
) {
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

wait.withContext = (context: GasReportContext) => {
  return (tx: ContractTransaction) => wait(tx, context);
};

wait.onTransaction = (tx: ContractTransaction) => Promise.resolve();
wait.onReceipt = (receipt: TransactionReceipt) => Promise.resolve();
