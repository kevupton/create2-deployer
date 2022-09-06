// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import "@openzeppelin/contracts/utils/Address.sol";

contract Placeholder {

    event Result(bytes data);

    fallback() external payable {
        (address target, bytes memory data) = abi.decode(msg.data, (address, bytes));
        bytes memory result = Address.functionCallWithValue(target, data, msg.value);
        emit Result(result);
    }
}
