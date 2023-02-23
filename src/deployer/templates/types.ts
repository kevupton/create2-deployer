import {ContractFactory} from 'ethers';
import {
  Deployer,
  DeployTemplateFromFactoryOptions,
  OptionsArgs,
} from '../deployer';
import {Template} from './index';

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
export type TemplateRecord = typeof Template;
export type TemplateID = keyof TemplateRecord;
export type TemplateCreateOptions<K extends TemplateID> = Parameters<
  TemplateRecord[K]['createOptions']
>[0];
export type TemplateInstance<K extends TemplateID> = InstanceType<
  TemplateRecord[K]['factory']
>;
