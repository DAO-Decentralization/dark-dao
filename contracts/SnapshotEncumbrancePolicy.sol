// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "./IEncumbrancePolicy.sol";
import "./IEncumberedWallet.sol";

struct SnapshotVote2 {
    address from;
    bytes32 space;
    uint64 timestamp;
    bytes32 proposal;
    uint32 choice;
    bytes32 reason;
    bytes32 app;
    bytes32 metadata;
}

contract SnapshotEncumbrancePolicy is IEncumbrancePolicy {
    IEncumberedWallet public walletContract;
    mapping (address => uint256) private enrollmentTime;
    mapping (address => mapping (bytes32 => address)) private allowedVoteSigner;
    
    constructor(IEncumberedWallet encumberedWallet) {
        walletContract = encumberedWallet;
    }
    
    function notifyEncumbranceEnrollment(address wallet, uint256 expiration, bytes calldata) public {
        require(msg.sender == address(walletContract), "Not wallet contract");
        require(expiration >= block.timestamp, "Expiration is in the past");
        enrollmentTime[wallet] = block.timestamp;
    }
    
    function messageAllowed(address, bytes calldata) public pure returns (bool) {
        return true;
    }
    
    function typedDataAllowed(address addr, EIP712DomainParams memory domain, string calldata dataType, bytes calldata data) public view returns (bool) {
        if (keccak256(bytes(domain.name)) != keccak256(bytes("snapshot"))) {
            return true;
        }
        
        if (keccak256(bytes(dataType[:4])) == keccak256(bytes("Vote"))) {
            if (keccak256(bytes(dataType)) == 0xaeb61c95cf08a4ae90fd703eea32d24d7936280c3c5b611ad2c40211583d4c85) {
                require(data.length == 256, "Incorrect vote data length");
                SnapshotVote2 memory vote = abi.decode(data, (SnapshotVote2));
                require(msg.sender != address(0) && msg.sender == allowedVoteSigner[addr][vote.proposal], "Wrong vote signer");
                return true;
            }
            return false;
        }
        
        return true;
    }
}
