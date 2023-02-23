import {ethers, run} from 'hardhat';
import {Deployer} from '../src/deployer';
import {
  BeaconProxy__factory,
  ERC1967Proxy__factory,
  ProxyAdmin__factory,
  TransparentUpgradeableProxy__factory,
  UpgradeableBeacon__factory,
} from '../typechain-types/factories/contracts/proxy';
import {ContractFactoryType} from '../src/deployer/types';

async function main() {
  const [signer] = await ethers.getSigners();
  console.log('signer', signer.address);

  const deployer = new Deployer(signer);

  const factories: ContractFactoryType[] = [
    TransparentUpgradeableProxy__factory,
    ProxyAdmin__factory,
    BeaconProxy__factory,
    UpgradeableBeacon__factory,
    ERC1967Proxy__factory,
  ];

  let hasDeployment = false;
  const templateIds: Record<string, string> = {};
  const verifyTasks: (() => void)[] = [];
  for (const factory of factories) {
    const instance = new factory();
    const name = factory.constructor.name.replace('__factory', '');
    const contract = await deployer.deploy(instance, {salt: 0});

    if (contract.deployTransaction) {
      hasDeployment = true;
    }

    await contract.deployed();

    verifyTasks.push(() => {
      run('verify:verify', {
        address: contract.address,
        // constructorArguments: [],
      }).catch(e => console.error(e.message));
    });
    templateIds[name] = await deployer.createTemplate(instance);
  }

  console.log(templateIds);

  if (hasDeployment) {
    await new Promise(res => setTimeout(res, 10000));
    await Promise.all(verifyTasks.map(task => task()));
  }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
