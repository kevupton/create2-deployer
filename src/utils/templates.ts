import {Deployer} from './deployer';
import {BigNumberish, Overrides} from 'ethers';
import {
  BeaconProxy__factory,
  ERC1967Proxy__factory,
  ProxyAdmin__factory,
  TransparentUpgradeableProxy__factory,
  UpgradeableBeacon__factory,
} from '../proxies';
import {Empty__factory} from '../../typechain-types';

export function makeTemplates(deployer: Deployer) {
  const templates = {
    empty: async (overrides?: Overrides) =>
      deployer.deploy(new Empty__factory(deployer.signer), {
        salt: 0,
        overrides,
      }),
    proxyAdmin: async (overrides?: Overrides) => {
      return deployer.deploy(new ProxyAdmin__factory(deployer.signer), {
        calls: [transferOwnership(deployer.signer.address)],
        salt: deployer.signer.address,
        overrides,
      });
    },
    transparentUpgradeableProxy: async (
      salt?: BigNumberish,
      overrides?: Overrides
    ) => {
      return deployer.deploy(
        new TransparentUpgradeableProxy__factory(deployer.signer),
        {
          args: [
            (await templates.empty()).address,
            (await templates.proxyAdmin()).address,
            '0x',
          ],
          salt,
          overrides,
        }
      );
    },
    beaconProxy: async (salt?: BigNumberish, overrides?: Overrides) => {
      return deployer.deploy(new BeaconProxy__factory(deployer.signer), {
        args: [(await templates.upgradeableBeacon(salt)).address, '0x'],
        salt,
        overrides,
      });
    },
    upgradeableBeacon: async (salt?: BigNumberish, overrides?: Overrides) => {
      return await deployer.deploy(
        new UpgradeableBeacon__factory(deployer.signer),
        {
          args: [(await templates.empty()).address],
          calls: [transferOwnership(deployer.address)],
          salt,
          overrides,
        }
      );
    },
    erc1967Proxy: async (salt?: BigNumberish, overrides?: Overrides) => {
      return await deployer.deploy(new ERC1967Proxy__factory(deployer.signer), {
        args: [(await templates.empty()).address, '0x'],
        salt,
        overrides,
      });
    },
  };
  return templates;
}

function transferOwnership(account: string) {
  return ProxyAdmin__factory.createInterface().encodeFunctionData(
    'transferOwnership',
    [account]
  );
}
