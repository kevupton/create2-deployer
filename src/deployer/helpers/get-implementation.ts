import {Contract, ContractFactory} from 'ethers';
import {Deployer, DeployOptions} from '../deployer';
import {PromiseOrValue} from '../../../typechain-types/common';
import {ContractFactoryFor} from '../types';

export interface ImplementationDeployment<
  T extends ContractFactory = ContractFactory
> {
  factory: T;
  options: DeployOptions<T>;
}

export type GetImplementationOptions<T extends Contract> = PromiseOrValue<
  T | ImplementationDeployment<ContractFactoryFor<T>>
>;

export async function getImplementation<T extends Contract>(
  deployer: Deployer,
  implementation: GetImplementationOptions<T>
): Promise<T> {
  implementation = await implementation;
  if (implementation instanceof Contract) {
    return implementation;
  }
  implementation = await deployer.deploy(
    implementation.factory,
    implementation.options
  );
  await implementation.deployed();
  return implementation;
}
