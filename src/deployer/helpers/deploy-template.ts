import {Deployer} from '../deployer';
import {FactoryInstance} from '../types';
import {
  Template,
  TemplateCreateOptions,
  TemplateID,
  TemplateInstance,
} from '../templates';
import {debug} from '../../utils';
import {getTemplateAddress} from './get-template-address';

export async function deployTemplate<K extends TemplateID>(
  deployer: Deployer,
  id: K,
  options: TemplateCreateOptions<K>
): Promise<FactoryInstance<TemplateInstance<K>>> {
  debug('deploying template ' + id);
  const target = getTemplateAddress(deployer, id, options);
  const {Factory, createOptions, args} = Template[id];
  const factory = new Factory();
  const contract = await deployer.deploy(
    factory,
    createOptions({
      ...(options as any),
      args,
      target,
    })
  );
  await contract.deployed();
  return contract as any;
}
