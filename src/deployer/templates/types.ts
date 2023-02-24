import {ContractFactory} from 'ethers';
import {Deployer, DeployOptions, OptionsArgs} from '../deployer';
import {Template} from './index';

export interface TemplateConfig<
  T extends ContractFactory = ContractFactory,
  TDeployData = {}
> extends OptionsArgs<T> {
  Factory: {new (): T};

  createOptions(
    options: DeployOptions<T> & TDeployData & {target: string}
  ): DeployOptions<T>;
}

export type TemplateConfigGenerator<T extends ContractFactory> = (
  deployer: Deployer
) => TemplateConfig<T>;
export type TemplateRecord = typeof Template;
export type TemplateID = keyof TemplateRecord;
export type TemplateCreateOptions<K extends TemplateID> = Omit<
  Parameters<TemplateRecord[K]['createOptions']>[0],
  'target'
>;
export type TemplateInstance<K extends TemplateID> = InstanceType<
  TemplateRecord[K]['Factory']
>;
