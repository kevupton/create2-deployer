import {ethers, run} from 'hardhat';
import {CREATE2_DEPLOYER_ADDRESS, Deployer} from '../src/deployer';
import {
  DeploymentRegistry__factory,
  Placeholder__factory,
} from '../typechain-types';
import {Overrides} from 'ethers';

async function main() {
  const [signer] = await ethers.getSigners();
  console.log('signer', signer.address);

  const create2DeployerFactory = await ethers.getContractFactory(
    'Create2Deployer'
  );

  let deployerAddress = CREATE2_DEPLOYER_ADDRESS;
  try {
    const create2Deployer = await create2DeployerFactory.deploy({
      nonce: 0,
    });
    await create2Deployer.deployed();
    console.log('deployer', create2Deployer.address);
    console.log(create2Deployer.deployTransaction.hash);
    deployerAddress = create2Deployer.address;
    return;
  } catch (e: any) {
    // console.error(e.message);
  }

  const deployer = new Deployer(signer);
  console.log('deployer', deployer.address);

  const overrides: Overrides = {
    //   nonce: 6,
    //   gasPrice: parseUnits('50', 'gwei'),
  };

  const placeholder = await deployer.deploy(new Placeholder__factory(), {
    salt: 0,
    overrides,
  });
  console.log(
    'placeholder',
    placeholder.address,
    placeholder.deployTransaction?.hash
  );
  await placeholder.deployed();

  const deploymentRegistry = await deployer.deploy(
    new DeploymentRegistry__factory(signer),
    {
      salt: 0,
      overrides,
    }
  );
  console.log(
    'deployment registry',
    deploymentRegistry.address,
    deploymentRegistry.deployTransaction?.hash
  );
  await deploymentRegistry.deployed();

  await new Promise(res => setTimeout(res, 10000));
  console.log('verifying...');

  if (deploymentRegistry.deployTransaction || placeholder.deployTransaction) {
    await new Promise(res => setTimeout(res, 30000));
  }

  await Promise.all([
    run('verify:verify', {
      address: placeholder.address,
    }).catch(e => console.error(e.message)),
    run('verify:verify', {
      address: deploymentRegistry.address,
    }).catch(e => console.error(e.message)),
    run('verify:verify', {
      address: deployerAddress,
    }).catch(e => console.error(e.message)),
  ]);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
