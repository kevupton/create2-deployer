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
import {Placeholder__factory} from '../../typechain-types/factories/contracts/Placeholder__factory';
import {
  defaultAbiCoder,
  hexConcat,
  Interface,
  keccak256,
  toUtf8Bytes,
} from 'ethers/lib/utils';
import {Create2Deployer} from '../../typechain-types';
import {debug} from '../utils';

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
  const PLACEHOLDER_ADDRESS = Deployer.factoryAddress(
    new Placeholder__factory()
  );
  debug('placeholder ' + PLACEHOLDER_ADDRESS);

  const templates = {
    placeholderFactory: new Placeholder__factory(deployer.signer),
    proxyAdminFactory: new ProxyAdmin__factory(deployer.signer),
    beaconProxyFactory: new BeaconProxy__factory(deployer.signer),
    upgradeableBeaconFactory: new UpgradeableBeacon__factory(deployer.signer),
    transparentUpgradeableProxyFactory:
      new TransparentUpgradeableProxy__factory(deployer.signer),
    erc1967ProxyFactory: new ERC1967Proxy__factory(deployer.signer),

    placeholder: async (overrides?: Overrides) =>
      deployer.deploy(templates.placeholderFactory, {
        salt: 0,
        overrides,
      }),
    placeholderAddress: PLACEHOLDER_ADDRESS,
    proxyAdmin: async (overrides?: Overrides) => {
      return deployer.deploy(templates.proxyAdminFactory, {
        calls: [
          transferOwnership(
            templates.proxyAdminAddress,
            deployer.signer.address
          ),
        ],
        salt: deployer.signer.address,
        overrides,
      });
    },
    proxyAdminAddress: Deployer.factoryAddress(new ProxyAdmin__factory(), {
      salt: deployer.signer.address,
    }),
    transparentUpgradeableProxy: async <T extends Contract>(
      id: string,
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

      await proxyAdmin.deployed();
      await implementation.deployed();

      debug('deploying proxy');
      const proxy = (await deployer.deploy<ContractFactory>(
        templates.transparentUpgradeableProxyFactory,
        {
          args: [PLACEHOLDER_ADDRESS, PLACEHOLDER_ADDRESS, '0x'],
          salt: templates.proxySalt(id.toLowerCase(), salt),
          calls: [
            changeAdmin(
              templates.transparentUpgradeableProxyAddress(id, salt),
              proxyAdmin.address
            ),
          ],
          overrides,
        }
      )) as T;

      await proxy.deployed();

      const currentImpl = BigNumber.from(
        await proxyAdmin.getProxyImplementation(proxy.address)
      );

      let call: FunctionCall<T> | undefined;
      if (
        initializer &&
        (currentImpl.eq(PLACEHOLDER_ADDRESS) || proxy.deployTransaction)
      ) {
        debug('initializing proxy');
        call =
          typeof initializer !== 'object'
            ? {id: initializer, args: []}
            : initializer;
      } else if (upgradeCall && !currentImpl.eq(implementation.address)) {
        debug('upgrading proxy');
        call =
          typeof upgradeCall !== 'object'
            ? {id: upgradeCall, args: []}
            : upgradeCall;
      }

      debug('should upgrade? ' + !currentImpl.eq(implementation.address));
      if (!currentImpl.eq(implementation.address)) {
        debug('upgrading implementation to ' + implementation.address);
        const data = call
          ? encodeFunctionCall<T>(implementation.interface, call)
          : undefined;

        const tx = data
          ? await proxyAdmin.upgradeAndCall(
              proxy.address,
              implementation.address,
              data
            )
          : await proxyAdmin.upgrade(proxy.address, implementation.address);
        await tx.wait();
      }

      const result: T = implementation.attach(proxy.address) as T;

      Object.defineProperty(result, 'deployTransaction', {
        writable: false,
        value: proxy.deployTransaction,
      });

      if (!proxy.deployTransaction) {
        result._deployedPromise = Promise.resolve(result);
      }

      return result;
    },
    transparentUpgradeableProxyAddress: (id: string, salt?: BigNumberish) => {
      return Deployer.factoryAddress(
        templates.transparentUpgradeableProxyFactory,
        {
          args: [PLACEHOLDER_ADDRESS, PLACEHOLDER_ADDRESS, '0x'],
          salt: templates.proxySalt(id.toLowerCase(), salt),
        }
      );
    },
    beaconProxy: async (
      beaconAddress: string,
      id?: string,
      salt?: BigNumberish,
      overrides?: Overrides
    ) => {
      return deployer.deploy(templates.beaconProxyFactory, {
        args: [beaconAddress, '0x'],
        salt: templates.proxySalt(id, salt),
        overrides,
      });
    },
    beaconProxyAddress: async (
      beaconAddress: string,
      id?: string,
      salt?: BigNumberish
    ) => {
      return Deployer.factoryAddress(templates.beaconProxyFactory, {
        args: [beaconAddress, '0x'],
        salt,
      });
    },
    upgradeableBeacon: async (
      id?: string,
      salt?: BigNumberish,
      overrides?: Overrides
    ) => {
      return await deployer.deploy(templates.upgradeableBeaconFactory, {
        args: [PLACEHOLDER_ADDRESS],
        calls: [
          transferOwnership(
            templates.upgradeableBeaconAddress(id, salt),
            deployer.address
          ),
        ],
        salt,
        overrides,
      });
    },
    upgradeableBeaconAddress: (id?: string, salt?: BigNumberish) =>
      Deployer.factoryAddress(templates.upgradeableBeaconFactory, {
        salt: templates.proxySalt(id, salt),
        args: [PLACEHOLDER_ADDRESS],
      }),
    erc1967Proxy: async (salt?: BigNumberish, overrides?: Overrides) => {
      return await deployer.deploy(templates.erc1967ProxyFactory, {
        args: [PLACEHOLDER_ADDRESS, '0x'],
        salt,
        overrides,
      });
    },
    proxySalt(id = 'default', salt = deployer.defaultSalt) {
      return keccak256(
        hexConcat([
          toUtf8Bytes(id),
          BigNumber.from(salt ?? deployer.defaultSalt).toHexString(),
        ])
      );
    },
  };
  Object.freeze(templates);

  return templates;

  function encodeFunctionCall<T extends Contract>(
    int: Interface,
    call: FunctionCall<T>
  ) {
    const fn = int.functions[call.id.toString()];
    return hexConcat([
      int.getSighash(fn),
      defaultAbiCoder.encode(
        fn.inputs.map(input => input.type),
        call.args || []
      ),
    ]);
  }

  function transferOwnership(
    target: string,
    account: string
  ): Create2Deployer.FunctionCallStruct {
    return {
      target,
      data: ProxyAdmin__factory.createInterface().encodeFunctionData(
        'transferOwnership',
        [account]
      ),
    };
  }

  function changeAdmin(
    target: string,
    account: string
  ): Create2Deployer.FunctionCallStruct {
    return {
      target: PLACEHOLDER_ADDRESS,
      data: defaultAbiCoder.encode(
        ['address', 'bytes'],
        [
          target,
          TransparentUpgradeableProxy__factory.createInterface().encodeFunctionData(
            'changeAdmin',
            [account]
          ),
        ]
      ),
    };
  }
}
