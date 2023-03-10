import {ethers, verify} from 'hardhat';
import {Deployer, Template} from '../src/deployer';

async function main() {
  const [signer] = await ethers.getSigners();
  console.log('signer', signer.address);

  const deployer = new Deployer(signer);
  const verifyCommands: (() => Promise<void>)[] = [];

  for (const [name, {Factory, args}] of Object.entries(Template)) {
    const instance = new Factory();
    const address = deployer.factoryAddress(instance, {args, salt: 0});

    console.log('deploying template', name, address);

    verifyCommands.push(async () => {
      console.log('verifying', name);
      return verify({
        name,
        address,
        constructorArguments: args,
        noCompile: true,
      });
    });

    const contract = await deployer.deploy(instance, {args, salt: 0});
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
