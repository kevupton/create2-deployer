import {Deployer} from './deployer';
import {
  BigNumber,
  BigNumberish,
  Contract,
  ContractFactory,
  Overrides,
} from 'ethers';
import {
  BeaconProxy__factory,
  ERC1967Proxy__factory,
  ProxyAdmin,
  ProxyAdmin__factory,
  TransparentUpgradeableProxy__factory,
  UpgradeableBeacon__factory,
} from '../proxies';
import {Empty__factory} from '../../typechain-types/factories/Empty__factory';
import {defaultAbiCoder} from 'ethers/lib/utils';

export type FunctionName<T extends Contract> =
  keyof T['interface']['functions'];

export interface FunctionCall<T extends Contract> {
  id: FunctionName<T>;
  args: ReadonlyArray<unknown>;
}

export interface ProxyOptions<T extends Contract> {
  salt?: BigNumberish;
  overrides?: Overrides;
  proxyAdmin?: ProxyAdmin;
  upgradeCall?: FunctionCall<T> | FunctionName<T>;
  initializer?: FunctionCall<T> | FunctionName<T>;
}

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
    transparentUpgradeableProxy: async <T extends Contract>(
      implementation: T,
      {
        salt,
        overrides,
        proxyAdmin,
        upgradeCall,
        initializer,
      }: ProxyOptions<T> = {}
    ) => {
      proxyAdmin = proxyAdmin ?? (await templates.proxyAdmin());
      const empty = await templates.empty();
      const proxy = (await deployer.deploy<ContractFactory>(
        new TransparentUpgradeableProxy__factory(deployer.signer),
        {
          args: [empty.address, proxyAdmin.address, '0x'],
          salt,
          overrides,
        }
      )) as T & {isExisting: boolean};

      const currentImpl = BigNumber.from(
        await proxyAdmin.getProxyImplementation(proxy.address)
      );

      let call: FunctionCall<T> | undefined;
      if (initializer && currentImpl.eq(empty.address)) {
        call =
          typeof initializer !== 'object'
            ? {id: initializer, args: []}
            : initializer;
      } else if (upgradeCall && !currentImpl.eq(implementation.address)) {
        call =
          typeof upgradeCall !== 'object'
            ? {id: upgradeCall, args: []}
            : upgradeCall;
      }

      const data = call
        ? defaultAbiCoder.encode(
            implementation.interface.functions[call.id.toString()].inputs.map(
              input => input.type
            ),
            call.args || []
          )
        : undefined;

      const tx = data
        ? await proxyAdmin.upgradeAndCall(
            proxy.address,
            implementation.address,
            data
          )
        : await proxyAdmin.upgrade(proxy.address, implementation.address);
      await tx.wait();

      return proxy;
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
