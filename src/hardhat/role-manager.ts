import {Contract, Signer} from 'ethers';
import {keccak256, toUtf8Bytes} from 'ethers/lib/utils';
import {debug, wait} from '../utils';
import {ContractConfigurationWithId} from './types';

export class RoleManager {
  private readonly contracts: Record<symbol, Contract> = {};
  private readonly configs = new Map<ContractConfigurationWithId, Contract>();
  private readonly groups = new Map<
    Contract,
    [role: string, target: string][]
  >();

  registerRole(role: symbol, contract: Contract) {
    this.contracts[role] = contract;
  }

  registerConfig(config: ContractConfigurationWithId, contract: Contract) {
    this.configs.set(config, contract);
  }

  getContractByRole(symbol: symbol) {
    if (!this.contracts[symbol]) {
      throw new Error('symbol has not been registered.');
    }
    return this.contracts[symbol];
  }

  getContractByConfig(config: ContractConfigurationWithId) {
    const value = this.configs.get(config);
    if (!value) {
      throw new Error('config has not been registered.');
    }
    return value;
  }

  getRoleIdFromSymbol(role: symbol) {
    if (!role.description)
      throw new Error('invalid role symbol. missing description.');

    return keccak256(toUtf8Bytes(role.description));
  }

  async grantAll() {
    for (const [contract, groupings] of Array.from(this.groups.entries())) {
      const hasRoles = await Promise.all(
        groupings.map(async ([role, target]) => {
          return contract.hasRole(role, target);
        })
      );

      if ('multicall' in contract) {
        const calls = hasRoles
          .map((hasRole, index) => {
            const [role, account] = groupings[index];
            if (hasRole) {
              debug('role ' + role + ' already granted for ' + account);
              return;
            }
            debug('granting role ' + role + ' for ' + account);
            return contract.interface.encodeFunctionData(
              'grantRole',
              groupings[index]
            );
          })
          .filter(Boolean);

        if (calls.length > 0) {
          await contract.multicall(calls).then(
            wait.withContext({
              name: contract.constructor.name,
              action: 'multicall-grantRole',
              address: contract.address,
            })
          );
        }
      } else {
        for (const index in groupings) {
          const [role, account] = groupings[index];
          const hasRole = hasRoles[index];
          if (hasRole) {
            debug('role ' + role + ' already granted for ' + account);
            continue;
          }

          debug('granting role ' + role + ' for ' + account);
          await contract.grantRole(role, account).then(
            wait.withContext({
              name: contract.constructor.name,
              action: 'grantRole',
              address: contract.address,
            })
          );
        }
      }
    }
  }

  group(contract: Contract, role: string, account: string) {
    const items = this.groups.get(contract) || [];
    items.push([role, account]);
    this.groups.set(contract, items);
  }
}
