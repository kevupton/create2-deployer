import {Deployer, OptionsBase} from '../deployer';
import {Template, TemplateID} from '../templates';

export const getTemplateAddress = <K extends TemplateID>(
  deployer: Deployer,
  id: K,
  options: OptionsBase = {}
) => {
  const {Factory, args} = Template[id];
  const factory = new Factory();
  return deployer.factoryAddress(factory, {
    ...options,
    args,
  });
};
