import {ContractTransaction} from 'ethers';
import {GasReportContext, gasReporter} from './gas-reporter';

export async function wait(
  tx: ContractTransaction,
  context?: GasReportContext
) {
  const confirmations = process.env.CONFIRMATIONS
    ? parseInt(process.env.CONFIRMATIONS, 10)
    : undefined;
  if (confirmations === 0) return;
  const receipt = await tx.wait(confirmations);
  gasReporter.report(receipt, context);
  return receipt;
}

wait.withContext = (context: GasReportContext) => {
  return (tx: ContractTransaction) => wait(tx, context);
};
