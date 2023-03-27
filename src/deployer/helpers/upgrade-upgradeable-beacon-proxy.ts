import {Deployer} from '../deployer';
import {BigNumber, Contract, Signer} from 'ethers';
import {UpgradeableBeacon} from '../../proxy';
import {debug, wait} from '../../utils';
import {
  getImplementation,
  GetImplementationOptions,
} from './get-implementation';
import {SafeEthersSigner} from '@safe-global/safe-ethers-adapters';

export interface UpgradeUpgradeableBeaconProxyOptions<T extends Contract> {
  beacon: UpgradeableBeacon;
  implementation: GetImplementationOptions<T>;
  signer?: Signer;
}

export async function upgradeUpgradeableBeaconProxy<
  T extends Contract = Contract
>(
  deployer: Deployer,
  {beacon, implementation, signer}: UpgradeUpgradeableBeaconProxyOptions<T>
) {
  implementation = await getImplementation(deployer, implementation);
  const currentImpl = BigNumber.from(await beacon.implementation());

  if (currentImpl.eq(implementation.address)) {
    return;
  }

  debug('upgrading proxy implementation to ' + implementation.address);

  if (signer) {
    beacon = beacon.connect(signer);
  }

  const tx = await beacon.upgradeTo(implementation.address);

  if (signer instanceof SafeEthersSigner) {
    console.log('sent safe tx to be signed: ' + tx.hash);
  } else {
    await wait(tx, {
      name: 'Beacon(' + beacon.constructor.name + ')',
      action: 'upgradeTo',
      address: beacon.address,
    });
  }
}
