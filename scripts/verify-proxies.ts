import {ethers, run} from 'hardhat';
import {Deployer, PLACEHOLDER_ADDRESS} from '../src/deployer';
import {
  BeaconProxy__factory,
  ProxyAdmin__factory,
  TransparentUpgradeableProxy__factory,
  UpgradeableBeacon__factory,
} from '../typechain-types/factories/contracts/proxy';

async function main() {
  const [signer] = await ethers.getSigners();
  console.log('signer', signer.address);

  const deployer = new Deployer(signer);

  const transparent = await deployer.deploy(
    new TransparentUpgradeableProxy__factory(signer)
  );
  await transparent.deployed();
  console.log('transparent done');
  const proxyAdmin = await deployer.deploy(new ProxyAdmin__factory(signer));
  await proxyAdmin.deployed();
  console.log('proxyAdmin done');
  const beacon = await deployer.deploy(new BeaconProxy__factory(signer));
  await beacon.deployed();
  console.log('beacon done');
  const upgradeableBeacon = await deployer.deploy(
    new UpgradeableBeacon__factory(signer)
  );
  console.log('test', upgradeableBeacon.deployTransaction?.hash);
  await upgradeableBeacon.deployed();
  console.log('upgradeableBeacon done');

  if (
    transparent.deployTransaction ||
    proxyAdmin.deployTransaction ||
    beacon.deployTransaction ||
    upgradeableBeacon.deployTransaction
  ) {
    await new Promise(res => setTimeout(res, 30000));
  }

  console.log('verifying');
  await Promise.all([
    run('verify:verify', {
      address: transparent.address,
      constructorArguments: [PLACEHOLDER_ADDRESS, PLACEHOLDER_ADDRESS, '0x'],
    }).catch(e => console.error(e.message)),
    run('verify:verify', {
      address: proxyAdmin.address,
    }).catch(e => console.error(e.message)),
    run('verify:verify', {
      address: beacon.address,
      constructorArgs: [PLACEHOLDER_ADDRESS, '0x'],
    }).catch(e => console.error(e.message)),
    run('verify:verify', {
      address: upgradeableBeacon.address,
      constructorArguments: [PLACEHOLDER_ADDRESS],
    }).catch(e => console.error(e.message)),
  ]);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
