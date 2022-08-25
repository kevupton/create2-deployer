import {ethers, run} from 'hardhat';
import {Deployer} from '../src/utils';

async function main() {
  const [signer] = await ethers.getSigners();
  const deployer = new Deployer(signer);
  const empty = await deployer.templates.empty();

  console.log('deployed at', empty.address);
  console.log(empty.deployTransaction?.hash);

  await empty.deployed();
  await new Promise(res => setTimeout(res, 30000));
  console.log('verifying...');

  await run('verify:verify', {
    address: empty.address,
  });
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
