// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "./IEncumbrancePolicy.sol";
import "./IEncumberedWallet.sol";
import "./OffchainDAOVoteVerifier.sol";

contract OffchainDAOBribingPolicy is IEncumbrancePolicy {
    IEncumberedWallet public walletContract;
    mapping (address => uint256) public enrollmentTime;
    OffchainDAOVoteVerifier voteVerifier;
    
    constructor(IEncumberedWallet encumberedWallet, OffchainDAOVoteVerifier _voteVerifier) {
        walletContract = encumberedWallet;
        voteVerifier = _voteVerifier;
    }
    
    function notifyEncumbranceEnrollment(address, address wallet, uint256 expiration, bytes calldata) public {
        require(msg.sender == address(walletContract), "Not wallet contract");
        require(expiration >= block.timestamp, "Expiration is in the past");
        enrollmentTime[wallet] = block.timestamp;
    }
    
    function messageAllowed(address, bytes calldata message) public view returns (bool) {
        // Decode the vote
        try voteVerifier.decodeVote(message) returns (bytes32, uint256) {
            return false;
        } catch {
            return true;
        }
    }
    
    function typedDataAllowed(address, EIP712DomainParams memory, string calldata, bytes calldata) public pure returns (bool) {
        return true;
    }
}
