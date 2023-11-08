// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "../IEncumbrancePolicy.sol";
import "../IEncumberedWallet.sol";

/**
 * @title Example Encumbrance Policy
 * @notice A minimal encumbrance policy demonstrating how to encumber Ethereum signed messages.
 * This contract is just an example and doesn't have much use; enrolling in this policy would allow
 * the contract owner to sign Ethereum messages (yet not transactions) using your encumbered
 * account's private key. Until the enrollment expires, the account owner is unable to sign messages
 * from the same account.
 */
contract ExampleEncumbrancePolicy is IEncumbrancePolicy {
    // @notice The encumbered wallet contract that this policy trusts
    IEncumberedWallet public walletContract;
    // @notice The owner of the contract who is granted the ability to sign messages from the
    // encumbered accounts that enroll in this policy.
    address public owner;

    constructor(IEncumberedWallet encumberedWallet) {
        walletContract = encumberedWallet;
        owner = msg.sender;
    }

    /**
     * @dev Called by the key-encumbered wallet contract when an account is enrolled in this policy
     */
    function notifyEncumbranceEnrollment(address, address, uint256 expiration, bytes calldata) public view {
        require(msg.sender == address(walletContract), "Not wallet contract");
        require(expiration >= block.timestamp, "Expiration is in the past");
    }

    /**
     * @notice Lets the contract owner sign an Ethereum message on behalf of an encumbered account
     */
    function signOnBehalf(address account, bytes calldata message) public view returns (bytes memory) {
        require(msg.sender == owner);
        return walletContract.signEncumberedMessage(account, message);
    }

    /**
     * @dev Returns true for properly formed messages, thereby preventing the account owner
     * from signing any ERC-191 Ethereum message outside this encumbrance policy and simultaneously
     * permitting this contract's owner to sign any Ethereum message using the account.
     */
    function messageAllowed(address, bytes calldata message) public pure returns (bool) {
        if (message.length > 0 && message[0] == hex"19") {
            return false;
        }
        return true;
    }

    /**
     * @dev This contract does not restrict EIP-712 typed data signatures.
     */
    function typedDataAllowed(
        address,
        EIP712DomainParams memory,
        string calldata,
        bytes calldata
    ) public pure returns (bool) {
        return true;
    }
}
