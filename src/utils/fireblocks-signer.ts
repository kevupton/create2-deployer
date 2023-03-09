import {BigNumber, BigNumberish, Bytes, Signer} from 'ethers';
import {
  BlockTag,
  EventType,
  Filter,
  Listener,
  Log,
  Network,
  Provider,
  TransactionRequest,
  TransactionResponse,
} from '@ethersproject/providers';
import {Deferrable} from 'ethers/lib/utils';

export class FireblocksSigner extends Signer {
  connect(provider: FireblocksProvider): Signer {
    return undefined;
  }

  getAddress(): Promise<string> {
    return Promise.resolve('');
  }

  signMessage(message: Bytes | string): Promise<string> {
    return Promise.resolve('');
  }

  signTransaction(
    transaction: Deferrable<TransactionRequest>
  ): Promise<string> {
    return Promise.resolve('');
  }
}

export class FireblocksProvider extends Provider {
  constructor(private readonly callProvider: Provider) {
    super();
  }
  call(
    transaction: Deferrable<TransactionRequest>,
    blockTag?: BlockTag | Promise<BlockTag>
  ): Promise<string> {
    return this.callProvider.call(transaction, blockTag);
  }

  emit(eventName: EventType, ...args: Array<any>): boolean {
    return false;
  }

  estimateGas(transaction: Deferrable<TransactionRequest>): Promise<BigNumber> {
    return this.callProvider.estimateGas(transaction);
  }

  getBalance(
    addressOrName: string | Promise<string>,
    blockTag?: BlockTag | Promise<BlockTag>
  ): Promise<BigNumber> {
    return Promise.resolve(undefined);
  }

  getBlock(
    blockHashOrBlockTag: BlockTag | string | Promise<BlockTag | string>
  ): Promise<Block> {
    return Promise.resolve(undefined);
  }

  getBlockNumber(): Promise<number> {
    return Promise.resolve(0);
  }

  getBlockWithTransactions(
    blockHashOrBlockTag: BlockTag | string | Promise<BlockTag | string>
  ): Promise<BlockWithTransactions> {
    return Promise.resolve(undefined);
  }

  getCode(
    addressOrName: string | Promise<string>,
    blockTag?: BlockTag | Promise<BlockTag>
  ): Promise<string> {
    return Promise.resolve('');
  }

  getGasPrice(): Promise<BigNumber> {
    return Promise.resolve(undefined);
  }

  getLogs(filter: Filter): Promise<Array<Log>> {
    return Promise.resolve(undefined);
  }

  getNetwork(): Promise<Network> {
    return Promise.resolve(undefined);
  }

  getStorageAt(
    addressOrName: string | Promise<string>,
    position: BigNumberish | Promise<BigNumberish>,
    blockTag?: BlockTag | Promise<BlockTag>
  ): Promise<string> {
    return Promise.resolve('');
  }

  getTransaction(transactionHash: string): Promise<TransactionResponse> {
    return Promise.resolve(undefined);
  }

  getTransactionCount(
    addressOrName: string | Promise<string>,
    blockTag?: BlockTag | Promise<BlockTag>
  ): Promise<number> {
    return Promise.resolve(0);
  }

  getTransactionReceipt(transactionHash: string): Promise<TransactionReceipt> {
    return Promise.resolve(undefined);
  }

  listenerCount(eventName?: EventType): number {
    return 0;
  }

  listeners(eventName?: EventType): Array<Listener> {
    return undefined;
  }

  lookupAddress(address: string | Promise<string>): Promise<string | null> {
    return Promise.resolve(undefined);
  }

  off(eventName: EventType, listener?: Listener): Provider {
    return undefined;
  }

  on(eventName: EventType, listener: Listener): Provider {
    return undefined;
  }

  once(eventName: EventType, listener: Listener): Provider;
  once(eventName: 'block', handler: () => void): void;
  once(
    eventName: EventType | 'block',
    listener: Listener | (() => void)
  ): Provider | void {
    return undefined;
  }

  removeAllListeners(eventName?: EventType): Provider {
    return undefined;
  }

  resolveName(name: string | Promise<string>): Promise<string | null> {
    return Promise.resolve(undefined);
  }

  sendTransaction(
    signedTransaction: string | Promise<string>
  ): Promise<TransactionResponse> {
    return Promise.resolve(undefined);
  }

  waitForTransaction(
    transactionHash: string,
    confirmations?: number,
    timeout?: number
  ): Promise<TransactionReceipt> {
    return Promise.resolve(undefined);
  }
}
