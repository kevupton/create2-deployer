import {TransactionReceipt} from '@ethersproject/providers';
import {BigNumber} from 'ethers';

export class GasReporter {
  #usage = BigNumber.from(0);
  #avgPrice = BigNumber.from(0);
  #totalCost = BigNumber.from(0);
  #log: TransactionReceipt[] = [];

  get usage() {
    return this.#usage;
  }

  get avgPrice() {
    return this.#avgPrice;
  }

  get totalCost() {
    return this.#totalCost;
  }

  get log() {
    return this.#log;
  }

  reset() {
    this.#usage = BigNumber.from(0);
    this.#avgPrice = BigNumber.from(0);
    this.#totalCost = BigNumber.from(0);
    this.#log = [];
  }

  report(receipt: TransactionReceipt) {
    const cost = receipt.effectiveGasPrice.mul(receipt.gasUsed);

    this.#usage = this.#usage.add(receipt.gasUsed);
    this.#totalCost = this.#totalCost.add(cost);
    this.#avgPrice = this.#totalCost.div(this.#usage);

    this.onReceive(receipt);
  }

  clone() {
    const reporter = new GasReporter();
    reporter.#log = this.#log.concat();
    reporter.#usage = this.#usage;
    reporter.#totalCost = this.#totalCost;
    reporter.#avgPrice = this.#avgPrice;
    return reporter;
  }

  toJSON(gasPrice = this.#avgPrice) {
    return {
      gasUsed: this.#usage,
      totalCost: this.#usage.mul(gasPrice),
      gasPrice,
    };
  }

  onReceive: (tx: TransactionReceipt) => void = () => {};
}

export const gasReporter = new GasReporter();
