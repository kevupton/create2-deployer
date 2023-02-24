import {Deployer} from '../deployer';
import {BigNumber, Contract, Signer} from 'ethers';
import {debug, wait} from '../../utils';
import {TransactionResponse} from '@ethersproject/providers';
import {getProxyAdmin, GetProxyAdminOptions} from './get-proxy-admin';
import {
  getImplementation,
  GetImplementationOptions,
} from './get-implementation';
import {encodeFunctionCall, FunctionCallOptions} from './encode-function-call';
import {SafeEthersSigner} from '@safe-global/safe-ethers-adapters';

export interface UpgradeTransparentUpgradeableProxyOptions<T extends Contract> {
  proxy: Contract;
  implementation: GetImplementationOptions<T>;
  proxyAdmin: GetProxyAdminOptions;
  call?: FunctionCallOptions<T>;
  signer?: Signer;
}

export async function upgradeTransparentUpgradeableProxy<
  T extends Contract = Contract
>(
  deployer: Deployer,
  {
    proxy,
    implementation,
    proxyAdmin,
    call,
    signer,
  }: UpgradeTransparentUpgradeableProxyOptions<T>
) {
  proxyAdmin = await getProxyAdmin(deployer, proxyAdmin);
  implementation = await getImplementation(deployer, implementation);

  const currentImpl = BigNumber.from(
    await proxyAdmin.getProxyImplementation(proxy.address)
  );

  if (currentImpl.eq(implementation.address)) {
    return;
  }

  debug('upgrading proxy implementation to ' + implementation.address);

  if (signer) {
    proxyAdmin = proxyAdmin.connect(signer);
  }

  let tx: TransactionResponse;
  if (call) {
    tx = await proxyAdmin.upgradeAndCall(
      proxy.address,
      implementation.address,
      encodeFunctionCall(implementation.interface, call)
    );
  } else {
    tx = await proxyAdmin.upgrade(proxy.address, implementation.address);
  }

  if (signer instanceof SafeEthersSigner) {
    console.log('sent safe tx of to be signed: ' + tx.hash);
  } else {
    await wait(tx);
  }
}
