import {ContractTransaction} from 'ethers';

export function wait(tx: ContractTransaction) {
  const confirmations = process.env.CONFIRMATIONS
    ? parseInt(process.env.CONFIRMATIONS, 10)
    : undefined;
  if (confirmations === 0) return;
  return tx.wait(confirmations);
}
