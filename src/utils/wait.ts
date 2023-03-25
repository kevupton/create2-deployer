import {ContractTransaction} from 'ethers';
import {gasReporter} from './gas-reporter';

export async function wait(tx: ContractTransaction) {
  const confirmations = process.env.CONFIRMATIONS
    ? parseInt(process.env.CONFIRMATIONS, 10)
    : undefined;
  if (confirmations === 0) return;
  const receipt = await tx.wait(confirmations);
  gasReporter.report(receipt);
  return receipt;
}
