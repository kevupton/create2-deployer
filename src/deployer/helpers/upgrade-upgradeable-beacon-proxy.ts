import {Deployer} from '../deployer';
import {BigNumber, Contract, Signer} from 'ethers';
import {
  ProxyAdmin,
  UpgradeableBeacon,
} from '../../../typechain-types/contracts/proxy';
import Safe from '@safe-global/safe-core-sdk';
import {debug, wait} from '../../utils';
import SafeServiceClient from '@safe-global/safe-service-client';
import {getSafeSigner} from './get-safe-signer';
import {TransactionResponse} from '@ethersproject/providers';
import {getProxyAdmin, GetProxyAdminOptions} from './get-proxy-admin';
import {
  getImplementation,
  GetImplementationOptions,
} from './get-implementation';
import {encodeFunctionCall, FunctionCallOptions} from './encode-function-call';
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
    await wait(tx);
  }
}
