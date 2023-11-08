// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "../IEncumbrancePolicy.sol";
import "../IEncumberedWallet.sol";
import "./OffchainDAOVoteVerifier.sol";

/**
 * @title Offchain DAO Bribing Policy
 * @notice A minimal encumbrance policy for encumbering votes on a hypothetical off-chain,
 * message-based DAO voting system.
 * Once an encumbered wallet enrolls in the policy, this contract is authorized to sign
 * any vote targeting the off-chain voting system from the encumbered account.
 */
contract OffchainDAOBribingPolicy is IEncumbrancePolicy {
    // @notice The encumbered wallet contract that this policy trusts
    IEncumberedWallet public walletContract;
    // @notice Stores when
    mapping(address => uint256) private enrollmentTime;
    // @notice A contract that parses vote messages
    OffchainDAOVoteVerifier voteVerifier;

    constructor(IEncumberedWallet encumberedWallet, OffchainDAOVoteVerifier _voteVerifier) {
        walletContract = encumberedWallet;
        voteVerifier = _voteVerifier;
    }

    /**
     * @dev Called by the key-encumbered wallet contract when an account is enrolled in this policy
     */
    function notifyEncumbranceEnrollment(address, address wallet, uint256 expiration, bytes calldata) public {
        require(msg.sender == address(walletContract), "Not wallet contract");
        require(expiration >= block.timestamp, "Expiration is in the past");
        enrollmentTime[wallet] = block.timestamp;
    }

    /**
     * @dev Returns true for properly formed vote messages, thereby preventing the account owner
     * from signing vote messages outside this encumbrance policy.
     */
    function messageAllowed(address, bytes calldata message) public view returns (bool) {
        // Encumber all properly-formed voting messages
        try voteVerifier.decodeVote(message) returns (bytes32, uint256) {
            return false;
        } catch {
            // Allow the account owner to sign other messages
            return true;
        }
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

    // Logic for handling bribe payments and signing votes here.
    // See the SnapshotDarkDAO contract for a complete example.
}
