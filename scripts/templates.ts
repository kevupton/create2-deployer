import {ethers, verify} from 'hardhat';
import {Deployer} from '../src/deployer';
import {deployTemplates} from '../src/deployer/templates/deploy-templates';

async function main() {
  const [signer] = await ethers.getSigners();
  console.log('signer', signer.address);

  const deployer = new Deployer(signer);
  const results = await deployTemplates(deployer);

  await new Promise(res => setTimeout(res, 10000));

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
