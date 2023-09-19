// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {ISnapshotEncumbrancePolicy} from "./SnapshotEncumbrancePolicy.sol";
import {EIP712DomainParams} from "./EIP712Utils.sol";

contract SnapshotDarkDAO {
    mapping (address => uint256) private registeredBribes;
    mapping (address => uint256) private bribesPaid;
    // Total registered voting power
    uint256 private totalVotingPower;
    address private briber;
    
    ISnapshotEncumbrancePolicy public snapshotEncPolicy;
    // Timestamp after which no more entrants are accepted
    uint256 public proposalStart;
    uint256 public proposalEnd;
    // The bribe for each account is encoded inside the Merkle tree
    bytes32 public bribeMerkleRoot;
    bytes32 public proposalHash;
    
    // Note that in a real Dark DAO, the briber will want functions for
    // withdrawing any extra funds that were not used in bribes
    constructor(ISnapshotEncumbrancePolicy _snapshotEncPolicy, bytes32 _proposalHash, uint256 _proposalStart, uint256 _proposalEnd, bytes32 _bribeMerkleRoot) payable {
        snapshotEncPolicy = _snapshotEncPolicy;
        proposalHash = _proposalHash;
        proposalStart = _proposalStart;
        proposalEnd = _proposalEnd;
        bribeMerkleRoot = _bribeMerkleRoot;
        briber = msg.sender;
        totalVotingPower = 0;
    }
    
    function getLeaf(address account, uint256 votingPower, uint256 bribe) public pure returns (bytes32) {
        return keccak256(bytes.concat(keccak256(abi.encode(account, votingPower, bribe))));
    }
    
    function enterDarkDAO(address account, uint256 votingPower, uint256 bribe, bytes32[] calldata proof) public {
        require(block.timestamp < proposalEnd, "Bribe has ended");
        require(snapshotEncPolicy.amVoteSigner(account, proposalHash, msg.sender, proposalStart, proposalEnd), "Dark DAO must be the vote signer");
        require(registeredBribes[account] == 0, "Already entered");
        require(MerkleProof.verify(proof, bribeMerkleRoot, getLeaf(account, votingPower, bribe)), "Invalid Merkle proof");
        registeredBribes[account] = bribe;
        totalVotingPower += votingPower;
    }
    
    function signVote(address account, EIP712DomainParams memory domain, string calldata dataType, bytes calldata data) public view returns (bytes memory) {
        require(msg.sender == briber, "Only the briber signs votes");
        return snapshotEncPolicy.signOnBehalf(account, proposalHash, domain, dataType, data);
    }
}
