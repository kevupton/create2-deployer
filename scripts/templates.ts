import {ethers, verify} from 'hardhat';
import {Deployer, Template} from '../src/deployer';

async function main() {
  const [signer] = await ethers.getSigners();
  console.log('signer', signer.address);

  const deployer = new Deployer(signer);
  const verifyCommands: (() => Promise<void>)[] = [];

  for (const [name, {factory, createOptions, demoData}] of Object.entries(
    Template
  )) {
    const instance = new factory();
    const options = createOptions(demoData as any);
    const address = deployer.factoryAddress(instance, options);

    console.log('deploying template', name, address);

    verifyCommands.push(async () => {
      console.log('verifying', name);
      return verify({name, address, constructorArguments: options.args});
    });

    const contract = await deployer.deploy(instance, options);
    await contract.deployed();
  }

  await Promise.all(verifyCommands.map(cmd => cmd()));
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
