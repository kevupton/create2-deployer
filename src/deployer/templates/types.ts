import {ContractFactory} from 'ethers';
import {
  Deployer,
  DeployTemplateFromFactoryOptions,
  OptionsArgs,
} from '../deployer';

export interface TemplateConfig<
  T extends ContractFactory = ContractFactory,
  TDeployData = {}
> extends OptionsArgs<T> {
  factory: {new (): T};

  createOptions(
    options: DeployTemplateFromFactoryOptions<T> & TDeployData
  ): DeployTemplateFromFactoryOptions<T>;
}

export type TemplateConfigGenerator<T extends ContractFactory> = (
  deployer: Deployer
) => TemplateConfig<T>;
