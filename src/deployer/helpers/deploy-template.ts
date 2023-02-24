import {Deployer} from '../deployer';
import {FactoryInstance} from '../types';
import {
  Template,
  TemplateCreateOptions,
  TemplateID,
  TemplateInstance,
} from '../templates';
import {debug} from '../../utils';

export async function deployTemplate<K extends TemplateID>(
  deployer: Deployer,
  id: K,
  options: TemplateCreateOptions<K>
): Promise<FactoryInstance<TemplateInstance<K>>> {
  debug('deploying template ' + id);
  const config = Template[id];
  const factory = new config.factory();
  const contract = await deployer.deployTemplateFromFactory(
    factory,
    config.createOptions(options as any)
  );
  await contract.deployed();
  return contract as any;
}
