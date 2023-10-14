// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import {Type2TxMessage} from "./EthereumTransaction.sol";
import {TransactionSerializer} from "./TransactionSerializer.sol";

contract TransactionSerializerTest {
    function serializeTransaction(Type2TxMessage calldata _tx) public pure returns (bytes memory txBytes) {
        return TransactionSerializer.serializeTransaction(_tx);
    }
}
