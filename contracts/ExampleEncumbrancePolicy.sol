// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "./IEncumbrancePolicy.sol";
import "./IEncumberedWallet.sol";

contract ExampleEncumbrancePolicy is IEncumbrancePolicy {
    IEncumberedWallet public walletContract;

    constructor(IEncumberedWallet encumberedWallet) {
        walletContract = encumberedWallet;
    }

    function notifyEncumbranceEnrollment(address, address, uint256 expiration, bytes calldata) public view {
        require(msg.sender == address(walletContract), "Not wallet contract");
        require(expiration >= block.timestamp, "Expiration is in the past");
    }

    function signOnBehalf(address account, bytes calldata message) public view returns (bytes memory) {
        return walletContract.signEncumberedMessage(account, message);
    }

    function messageAllowed(address, bytes calldata message) public pure returns (bool) {
        if (message.length > 0 && message[0] == hex"19") {
            return false;
        }
        return true;
    }

    function typedDataAllowed(
        address,
        EIP712DomainParams memory,
        string calldata,
        bytes calldata
    ) public pure returns (bool) {
        return true;
    }
}
