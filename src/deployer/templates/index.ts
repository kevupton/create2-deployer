import {proxyAdminTemplate} from './proxy-admin';
import {transparentUpgradeableProxyTemplate} from './transparent-upgradeable-proxy';
import {upgradeableBeaconTemplate} from './upgradeable-beacon';

export * from './types';

export const Template = {
  ProxyAdmin: proxyAdminTemplate,
  TransparentUpgradeableProxy: transparentUpgradeableProxyTemplate,
  UpgradeableBeacon: upgradeableBeaconTemplate,
};
