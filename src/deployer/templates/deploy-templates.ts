import {ContractFactoryType} from '../types';
import {Deployer} from '../deployer';
import {Template} from './index';

export interface TemplateDeployment {
  id: string;
  name: string;
  address: string;
  factory: ContractFactoryType;
}

export async function deployTemplates(deployer: Deployer) {
  const factories: ContractFactoryType[] = Object.values(Template).map(
    obj => obj.factory
  );

  const templateIds: Record<string, string> = {};
  const results: Record<string, TemplateDeployment> = {};
  for (const factory of factories) {
    const instance = new factory();
    const name = factory.name.replace('__factory', '');
    const templateId = Deployer.templateId(instance);
    const address = deployer.factoryAddress(instance, {salt: 0});

    templateIds[name] = templateId;

    results[name] = {
      id: templateId,
      name,
      address,
      factory,
    };

    await deployer.createTemplate(instance);
    await deployer.deployTemplate(templateId, {salt: 0});
  }

  return results;
}
