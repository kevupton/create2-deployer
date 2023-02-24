import {ethers, verify} from 'hardhat';
import {Deployer, PLACEHOLDER_ADDRESS} from '../src/deployer';
import {TransparentUpgradeableProxy__factory} from '../typechain-types';

async function main() {
  const [signer] = await ethers.getSigners();
  console.log('signer', signer.address);

  const deployer = new Deployer(signer);
  const contract = await deployer.deploy(
    new TransparentUpgradeableProxy__factory(),
    {
      args: [PLACEHOLDER_ADDRESS, PLACEHOLDER_ADDRESS, '0x'],
    }
  );
  console.log(contract.address, contract.deployTransaction?.hash);
  await contract.deployed();

  await verify({
    address: contract.address,
    // contract:
    //   '@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol:ERC1967Proxy',
    constructorArguments: [PLACEHOLDER_ADDRESS, '0x'],
  });
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
