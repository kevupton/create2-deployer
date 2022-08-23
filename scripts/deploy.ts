import {ethers, run} from 'hardhat';

async function main() {
  const create2DeployerFactory = await ethers.getContractFactory(
    'Create2Deployer'
  );
  const create2Deployer = await create2DeployerFactory.deploy({
    nonce: 0,
  });

  await create2Deployer.deployed();

  console.log('deployed at', create2Deployer.address);
  console.log(create2Deployer.deployTransaction.hash);

  await new Promise(res => setTimeout(res, 60000));
  console.log('verifying...');

  await run('verify:verify', {
    address: create2Deployer.address,
  });
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
