import {ethers, run} from 'hardhat';
import {CREATE2_DEPLOYER_ADDRESS, Deployer} from '../src/utils';

async function main() {
  const [signer] = await ethers.getSigners();
  const create2DeployerFactory = await ethers.getContractFactory(
    'Create2Deployer'
  );

  try {
    const create2Deployer = await create2DeployerFactory.deploy({
      nonce: 0,
    });
    await create2Deployer.deployed();
    console.log('deployer', create2Deployer.address);
    console.log(create2Deployer.deployTransaction.hash);
  } catch (e: any) {
    console.error(e.message);
  }

  const deployer = new Deployer(signer);

  const placeholder = await deployer.templates.placeholder();
  console.log('placeholder', placeholder.address);
  await placeholder.deployed();

  await new Promise(res => setTimeout(res, 10000));
  console.log('verifying...');

  await Promise.all([
    run('verify:verify', {
      address: placeholder.address,
    }).catch(e => console.error(e.message)),
    run('verify:verify', {
      address: CREATE2_DEPLOYER_ADDRESS,
    }).catch(e => console.error(e.message)),
  ]);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
