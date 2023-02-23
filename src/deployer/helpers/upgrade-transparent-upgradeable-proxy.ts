import {Deployer} from '../deployer';
import {BigNumber, Contract} from 'ethers';
import {ProxyAdmin} from '../../../typechain-types/contracts/proxy';
import Safe from '@safe-global/safe-core-sdk';
import {debug} from '../../utils';
import SafeServiceClient from '@safe-global/safe-service-client';

export async function upgradeTransparentUpgradeableProxy(
  deployer: Deployer,
  proxy: Contract,
  implementation: Contract,
  proxyAdmin: ProxyAdmin,
  data = '0x',
  multisig?: Safe
) {
  const currentImpl = BigNumber.from(
    await proxyAdmin.getProxyImplementation(proxy.address)
  );

  if (currentImpl.eq(implementation.address)) {
    return;
  }

  debug('upgrading proxy implementation to ' + implementation.address);

  debug('is multisig?', !!multisig);
  if (multisig) {
    const txData =
      data !== '0x'
        ? proxyAdmin.interface.encodeFunctionData('upgradeAndCall', [
            proxy.address,
            implementation.address,
            data,
          ])
        : proxyAdmin.interface.encodeFunctionData('upgrade', [
            proxy.address,
            implementation.address,
          ]);

    if (multisig instanceof Safe) {
      debug('submitting upgrade to multisig wallet');
      const safeTransaction = await multisig.createTransaction({
        safeTransactionData: {
          data: txData,
          to: proxyAdmin.address,
          value: '0',
        },
      });
      const safeTransactionHash = await multisig.getTransactionHash(
        safeTransaction
      );
      const senderSignature = await multisig.signTransactionHash(
        safeTransactionHash
      );
      const safeService = new SafeServiceClient({
        txServiceUrl: 'https://safe-transaction.goerli.gnosis.io/',
        ethAdapter: multisig.getEthAdapter(),
      });

      debug('proposed tx details', {
        safeAddress: multisig.getAddress(),
        safeTransactionData: safeTransaction.data,
        safeTxHash: safeTransactionHash,
        senderAddress: senderSignature.signer,
      });
      await safeService.proposeTransaction({
        safeAddress: multisig.getAddress(),
        safeTransactionData: safeTransaction.data,
        safeTxHash: safeTransactionHash,
        senderAddress: senderSignature.signer,
        senderSignature: senderSignature.data,
      });
    } else {
      throw new Error('Unknown multisig');
    }
  } else {
    const tx = data
      ? await proxyAdmin.upgradeAndCall(
          proxy.address,
          implementation.address,
          data
        )
      : await proxyAdmin.upgrade(proxy.address, implementation.address);
    await tx.wait();
  }
}
