import {Contract, ContractFactory} from 'ethers';
import {Signer} from '@ethersproject/abstract-signer';
import {ContractInterface} from '@ethersproject/contracts/src.ts';
import {Logger} from '@ethersproject/logger';
import {BytesLike} from '@ethersproject/bytes';
import {BigNumber} from '@ethersproject/bignumber';
import {Interface} from '@ethersproject/abi';
import {Provider} from '@ethersproject/providers';

export type FactoryInstance<T extends ContractFactory = ContractFactory> =
  Awaited<ReturnType<T['deploy']>>;

export type InstanceFactory<T extends Contract = Contract> = Omit<
  ContractFactory,
  'deploy'
> & {
  deploy(...args: any[]): Promise<T>;
};

export interface ContractFactoryType {
  new (signer?: Signer): ContractFactory;
  getContract(
    address: string,
    contractInterface: ContractInterface,
    signer?: Signer
  ): Contract;
  fromSolidity(compilerOutput: any, signer?: Signer): ContractFactory;

  getInterface(contractInterface: ContractInterface): Interface;

  getContractAddress(tx: {
    from: string;
    nonce: BytesLike | BigNumber | number;
  }): string;
}
