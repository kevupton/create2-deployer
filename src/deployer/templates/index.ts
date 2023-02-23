import {beaconProxyTemplate} from './beacon-proxy';
import {erc1967Template} from './erc1967-proxy';
import {proxyAdminTemplate} from './proxy-admin';
import {transparentUpgradeableProxyTemplate} from './transparent-upgradeable-proxy';
import {upgradeableBeaconTemplate} from './upgradeable-beacon';

export * from './types';

export const Template = {
  BeaconProxy: beaconProxyTemplate,
  ERC1967Proxy: erc1967Template,
  ProxyAdmin: proxyAdminTemplate,
  TransparentUpgradeableProxy: transparentUpgradeableProxyTemplate,
  UpgradeableBeacon: upgradeableBeaconTemplate,
};
