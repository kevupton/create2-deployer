import {ethers, verify} from 'hardhat';
import {CREATE2_DEPLOYER_ADDRESS, Deployer} from '../src/deployer';
import {Placeholder__factory} from '../typechain-types';

async function main() {
  const [signer] = await ethers.getSigners();
  console.log('signer', signer.address);

  const create2DeployerFactory = await ethers.getContractFactory(
    'Create2Deployer'
  );

  const deployerAddress = CREATE2_DEPLOYER_ADDRESS;
  try {
    const gasPrice = await signer.getGasPrice();
    const create2Deployer = await create2DeployerFactory.deploy({
      nonce: 0,
      gasPrice: gasPrice.mul(2),
    });
    await create2Deployer.deployed();
    console.log('deployer', create2Deployer.address);
    console.log(create2Deployer.deployTransaction.hash);
    return;
  } catch (e: any) {
    // console.error(e.message);
  }

  const deployer = new Deployer(signer);
  console.log('deployer', deployer.address);

  const placeholder = await deployer.deploy(new Placeholder__factory(), {
    salt: 0,
    overrides: {
      nonce: 1,
    },
  });
  console.log(
    'placeholder',
    placeholder.address,
    placeholder.deployTransaction?.hash
  );
  await placeholder.deployed();

  console.log('verifying...');
  await Promise.all([
    verify({
      name: 'Placeholder',
      address: placeholder.address,
      noCompile: true,
    }),
    verify({name: 'Deployer', address: deployerAddress, noCompile: true}),
  ]);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
