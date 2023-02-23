import {Contract, ContractFactory} from 'ethers';

export type ContractFromFactory<T extends ContractFactory = ContractFactory> =
  Awaited<ReturnType<T['deploy']>>;

export type ContractFactoryFor<T extends Contract = Contract> = Omit<
  ContractFactory,
  'deploy'
> & {
  deploy(...args: any[]): Promise<T>;
};

export interface ContractFactoryType {
  new (): ContractFactory;
}
