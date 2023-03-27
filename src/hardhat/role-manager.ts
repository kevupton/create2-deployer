import {Contract} from 'ethers';
import {keccak256, toUtf8Bytes} from 'ethers/lib/utils';
import {debug, wait} from '../utils';

export class RoleManager {
  private readonly contracts: Record<symbol, Contract> = {};

  register(role: symbol, contract: Contract) {
    this.contracts[role] = contract;
  }

  async grant(role: symbol, account: string) {
    if (!role.description)
      throw new Error('invalid role symbol. missing description.');

    const roleId = keccak256(toUtf8Bytes(role.description));
    const contract = this.contracts[role];

    if (!contract)
      throw new Error('missing contract for role ' + role.description);

    if (!(await contract.hasRole(roleId, account))) {
      debug('granting role ' + role.description + ' for ' + account);
      await contract.grantRole(roleId, account).then(
        wait.withContext({
          name: contract.constructor.name,
          action: 'grantRole',
          address: contract.address,
        })
      );
    } else {
      debug('role ' + role.description + ' already granted for ' + account);
    }
  }
}
