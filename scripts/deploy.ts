import {ethers, run} from 'hardhat';
import {Deployer} from '../src/utils';

async function main() {
  const [signer] = await ethers.getSigners();
  const create2DeployerFactory = await ethers.getContractFactory(
    'Create2Deployer'
  );
  const create2Deployer = await create2DeployerFactory.deploy({
    nonce: 0,
  });

  await create2Deployer.deployed();

  console.log('deployer', create2Deployer.address);
  console.log(create2Deployer.deployTransaction.hash);

  const deployer = new Deployer(signer);

  const empty = await deployer.templates.empty();
  console.log('empty', empty.address);
  await empty.deployed();

  const owner = await deployer.templates.owner();
  console.log('owner', owner.address);
  await owner.deployed();

  await new Promise(res => setTimeout(res, 10000));
  console.log('verifying...');

  await Promise.all([
    run('verify:verify', {
      address: empty.address,
    }).catch(e => console.error(e.message)),
    run('verify:verify', {
      address: owner.address,
    }).catch(e => console.error(e.message)),
    run('verify:verify', {
      address: create2Deployer.address,
    }).catch(e => console.error(e.message)),
  ]);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
