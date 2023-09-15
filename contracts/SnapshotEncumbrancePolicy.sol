// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

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

contract SnapshotEncumbrancePolicy is IEncumbrancePolicy, EIP712 {
    IEncumberedWallet public walletContract;
    mapping (address => address) private accountOwner;
    mapping (address => uint256) private enrollmentTime;
    mapping (address => mapping (bytes32 => address)) private allowedVoteSigner;
    
    constructor(IEncumberedWallet encumberedWallet) EIP712("SnapshotEncumbrancePolicy", "0.0.1") {
        walletContract = encumberedWallet;
    }
    
    function notifyEncumbranceEnrollment(address _accountOwner, address account, uint256 expiration, bytes calldata) public {
        require(msg.sender == address(walletContract), "Not wallet contract");
        require(expiration >= block.timestamp, "Expiration is in the past");
        enrollmentTime[account] = block.timestamp;
        accountOwner[account] = _accountOwner;
    }
    
    function selfVoteSigner(address account, bytes32 proposal) public {
        setVoteSigner(account, proposal, msg.sender);
    }
    
    function setVoteSigner(address account, bytes32 proposal, address signer) public {
        require(accountOwner[account] == msg.sender, "Only account owner");
        require(signer != address(0), "Zero address");
        require(allowedVoteSigner[account][proposal] == address(0), "Vote signer already set");
        allowedVoteSigner[account][proposal] = signer;
    }
    
    function messageAllowed(address, address, bytes calldata) public pure returns (bool) {
        return true;
    }
    
    function typedDataAllowed(address addr, address signer, EIP712DomainParams memory domain, string calldata dataType, bytes calldata data) public view returns (bool) {
        // We would not like to leak the addresses account owners authorize
        require(msg.sender == address(walletContract) || msg.sender == accountOwner[addr], "Unauthorized");
        
        if (keccak256(bytes(domain.name)) != keccak256(bytes("snapshot"))) {
            return true;
        }
        
        if (keccak256(bytes(dataType[:4])) == keccak256(bytes("Vote"))) {
            if (keccak256(bytes(dataType)) == 0xaeb61c95cf08a4ae90fd703eea32d24d7936280c3c5b611ad2c40211583d4c85) {
                require(data.length == 256, "Incorrect vote data length");
                SnapshotVote2 memory vote = abi.decode(data, (SnapshotVote2));
                address voteSigner = allowedVoteSigner[addr][vote.proposal];
                require(voteSigner != address(0) && signer == voteSigner, "Wrong vote signer");
                return true;
            }
            return false;
        }
        
        return true;
    }
}