// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

struct Proposal {
    bytes title;
    bytes description;
    uint256 maxVoteSelection;
    uint256 creationTime;
    uint256 expirationTime;
}

contract OffchainDAOVoteVerifier {
    mapping(bytes32 => uint256) public proposalCreations;

    function createProposal(Proposal memory proposal) public returns (bytes32) {
        proposal.creationTime = block.timestamp;
        bytes32 proposalHash = keccak256(abi.encode(proposal));
        proposalCreations[proposalHash] = block.timestamp;
        return proposalHash;
    }

    function isValidVote(
        address voter,
        bytes calldata message,
        bytes calldata signature
    ) public view returns (bool isValid, bytes32 proposalId, uint256 voteSelection) {
        isValid = SignatureChecker.isValidSignatureNow(voter, keccak256(message), signature);
        if (isValid) {
            // Decode the vote
            try OffchainDAOVoteVerifier(address(this)).decodeVote(message) returns (
                bytes32 _proposalId,
                uint256 _voteSelection
            ) {
                proposalId = _proposalId;
                voteSelection = _voteSelection;
            } catch {
                isValid = false;
            }
        }
    }

    function decodeVote(bytes calldata message) public pure returns (bytes32 proposalId, uint256 voteSelection) {
        bytes32 magicStringExpected = "OffchainDAO Vote";
        bytes32 magicString;
        (magicString, proposalId, voteSelection) = abi.decode(message, (bytes32, bytes32, uint256));
        require(magicString == magicStringExpected, "Wrong magic string");
    }
}
