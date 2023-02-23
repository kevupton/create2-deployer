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
    BeaconProxy__factory,
    UpgradeableBeacon__factory,
    ERC1967Proxy__factory,
    ProxyAdmin__factory,
  ];

  const templateIds: Record<string, string> = {};
  const verifyTasks: (() => void)[] = [];
  for (const factory of factories) {
    const instance = new factory();
    const name = factory.name.replace('__factory', '');
    const templateId = Deployer.templateId(instance);
    const address = deployer.factoryAddress(instance, {salt: 0});

    templateIds[name] = templateId;

    console.log(name, address, templateId);

    await deployer.createTemplate(instance);
    await deployer.deployTemplate(templateId, {salt: 0});

    console.log('deployed');

    verifyTasks.push(() => {
      console.log('verifying', name);
      run('verify:verify', {
        address: address,
        // constructorArguments: [],
      }).catch(e => console.error(e.message));
    });
  }

  console.log(templateIds);

  await new Promise(res => setTimeout(res, 10000));
  await Promise.all(verifyTasks.map(task => task()));
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
