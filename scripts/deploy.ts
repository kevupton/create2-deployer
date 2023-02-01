import {ethers, run} from 'hardhat';
import {CREATE2_DEPLOYER_ADDRESS, Deployer} from '../src/deployer';
import {Placeholder__factory} from '../typechain-types';

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

  const placeholder = await deployer.deploy(new Placeholder__factory(signer), {
    salt: 0,
  });
  await placeholder.deployed();
  console.log('placeholder', placeholder.address);

  await new Promise(res => setTimeout(res, 10000));
  console.log('verifying...');

  await Promise.all([
    run('verify:verify', {
      address: placeholder.address,
    }).catch(e => console.error(e.message)),
    run('verify:verify', {
      address: CREATE2_DEPLOYER_ADDRESS,
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
