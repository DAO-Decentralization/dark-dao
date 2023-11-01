// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {ISnapshotEncumbrancePolicy} from "./SnapshotEncumbrancePolicy.sol";
import {EIP712DomainParams} from "../parsing/EIP712Utils.sol";

contract SnapshotDarkDAO {
    mapping(address => uint256) private registeredBribes;
    mapping(address => address) private accountOwners;
    mapping(address => uint256) private bribesPaid;
    // Total registered voting power
    uint256 private totalVotingPower;
    address private briber;
    uint256 private outstandingBribeTotal;

    ISnapshotEncumbrancePolicy public snapshotEncPolicy;
    // Timestamp after which no more entrants are accepted
    uint256 public proposalStart;
    uint256 public proposalEnd;
    // The bribe for each account is encoded inside the Merkle tree
    bytes32 public bribeMerkleRoot;
    bytes32 public proposalHash;

    constructor(
        ISnapshotEncumbrancePolicy _snapshotEncPolicy,
        bytes32 _proposalHash,
        uint256 _proposalStart,
        uint256 _proposalEnd,
        bytes32 _bribeMerkleRoot
    ) payable {
        snapshotEncPolicy = _snapshotEncPolicy;
        proposalHash = _proposalHash;
        proposalStart = _proposalStart;
        proposalEnd = _proposalEnd;
        bribeMerkleRoot = _bribeMerkleRoot;
        briber = msg.sender;
        totalVotingPower = 0;
    }

    receive() external payable {
        // Accept extra bribe money
    }

    function getLeaf(address account, uint256 votingPower, uint256 bribe) public pure returns (bytes32) {
        return keccak256(bytes.concat(keccak256(abi.encode(account, votingPower, bribe))));
    }

    function enterDarkDAO(address account, uint256 votingPower, uint256 bribe, bytes32[] calldata proof) public {
        require(block.timestamp < proposalEnd, "Bribe has ended");
        require(
            snapshotEncPolicy.amVoteSigner(account, proposalHash, msg.sender, proposalStart, proposalEnd),
            "Dark DAO must be the vote signer"
        );
        require(registeredBribes[account] == 0, "Already entered");
        require(
            MerkleProof.verify(proof, bribeMerkleRoot, getLeaf(account, votingPower, bribe)),
            "Invalid Merkle proof"
        );
        require(address(this).balance - outstandingBribeTotal >= bribe, "Insufficient bribe funds remaining");
        registeredBribes[account] = bribe;
        accountOwners[account] = msg.sender;
        outstandingBribeTotal += bribe;
        totalVotingPower += votingPower;
    }

    function signVote(
        address account,
        EIP712DomainParams memory domain,
        string calldata dataType,
        bytes calldata data
    ) public view returns (bytes memory) {
        require(msg.sender == briber, "Only the briber signs votes");
        return snapshotEncPolicy.signOnBehalf(account, proposalHash, domain, dataType, data);
    }

    function claimBribe(address account) public {
        require(msg.sender != address(0) && msg.sender == accountOwners[account], "Only account owner");
        require(bribesPaid[account] == 0, "Bribe already paid");
        require(registeredBribes[account] > 0, "Bribe not registered for this account");
        // Avoid re-entry
        uint256 bribe = registeredBribes[account];
        bribesPaid[account] = bribe;
        outstandingBribeTotal -= bribe;
        payable(msg.sender).transfer(bribe);
    }

    function withdrawUnusedFunds() public {
        require(msg.sender == briber);
        payable(msg.sender).transfer(address(this).balance - outstandingBribeTotal);
    }
}
