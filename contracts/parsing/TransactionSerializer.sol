// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "solidity-rlp/contracts/RLPReader.sol";
import {Type2TxMessage} from "./EthereumTransaction.sol";
import {RLPEncode} from "./RLPEncode.sol";

library TransactionSerializer {
    function serializeTransaction(Type2TxMessage calldata _tx) public pure returns (bytes memory txBytes) {
        bytes[] memory txRlpItems = new bytes[](9);
        txRlpItems[0] = RLPEncode.encodeUint(_tx.chainId);
        txRlpItems[1] = RLPEncode.encodeUint(_tx.nonce);
        txRlpItems[2] = RLPEncode.encodeUint(_tx.maxPriorityFeePerGas);
        txRlpItems[3] = RLPEncode.encodeUint(_tx.maxFeePerGas);
        txRlpItems[4] = RLPEncode.encodeUint(_tx.gasLimit);
        txRlpItems[5] = RLPEncode.encodeBytes(_tx.destination);
        txRlpItems[6] = RLPEncode.encodeUint(_tx.amount);
        txRlpItems[7] = RLPEncode.encodeBytes(_tx.payload);
        // Empty access list
        bytes[] memory emptyList;
        txRlpItems[8] = RLPEncode.encodeList(emptyList);

        txBytes = bytes.concat(hex"02", RLPEncode.encodeList(txRlpItems));
    }
}
