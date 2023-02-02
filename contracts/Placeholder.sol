// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import "@openzeppelin/contracts/utils/Address.sol";

address constant PLACEHOLDER_ADDRESS = 0xa1E70010986A3347D0D280957829325Fc5dAc5ad;

contract Placeholder {

    event Result(bool success, bytes data);

    fallback(bytes calldata data) external payable returns (bytes memory) {
        if (data.length > 32) {
            (address target, bytes memory _calldata) = abi.decode(data, (address, bytes));
            (bool success, bytes memory returndata) = target.call{value: msg.value}(_calldata);
            emit Result(success, returndata);
        } else {
            return abi.encode(address(this));
        }
        return '';
    }
}
