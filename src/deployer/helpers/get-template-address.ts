import {Deployer, FactoryAddressOptions} from '../deployer';
import {Template, TemplateID} from '../templates';
import {TemplateRecord} from '../templates/types';

export const getTemplateAddress = <K extends TemplateID>(
  deployer: Deployer,
  id: K,
  options?: FactoryAddressOptions<InstanceType<TemplateRecord[K]['factory']>>
) => {
  const factory = new Template[id].factory();
  return deployer.factoryAddress(factory, options);
};
