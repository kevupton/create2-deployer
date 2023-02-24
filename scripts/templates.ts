import {ethers, verify} from 'hardhat';
import {Deployer, Template} from '../src/deployer';
import {ContractFactoryType} from '../src/deployer/types';

export interface TemplateDeployment {
  name: string;
  address: string;
  factory: ContractFactoryType;
}

async function main() {
  const [signer] = await ethers.getSigners();
  console.log('signer', signer.address);

  const deployer = new Deployer(signer);

  const results: Record<string, TemplateDeployment> = {};
  for (const [name, {factory, createOptions, demoData}] of Object.entries(
    Template
  )) {
    const instance = new factory();
    const address = deployer.factoryAddress(instance, {salt: 0});

    console.log('deploying template ' + name, address);

    results[name] = {
      name,
      address,
      factory,
    };

    const contract = await deployer.deploy(
      instance,
      createOptions(demoData as any)
    );
    await contract.deployed();

    console.log('deployed');
  }

  await Promise.all(
    Object.values(results).map(async ({address, name}) => {
      console.log('verifying', name);
      return verify({name, address});
    })
  );
}
// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
