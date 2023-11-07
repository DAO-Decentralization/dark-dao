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

interface ISnapshotEncumbrancePolicy {
    function amVoteSigner(
        address account,
        bytes32 proposal,
        address sender,
        uint256 startTimestamp,
        uint256 endTimestamp
    ) external view returns (bool);

    function signOnBehalf(
        address account,
        bytes32 proposal,
        EIP712DomainParams memory domain,
        string calldata dataType,
        bytes calldata data
    ) external view returns (bytes memory);
}

contract SnapshotEncumbrancePolicy is IEncumbrancePolicy, EIP712 {
    IEncumberedWallet public walletContract;
    mapping(address => address) private accountOwner;
    mapping(address => uint256) private enrollmentTimestamp;
    mapping(address => uint256) private encumbranceExpiration;
    mapping(address => mapping(bytes32 => address)) private allowedVoteSigner;
    mapping(address => mapping(bytes32 => uint256)) private voteSignerTimestamp;

    constructor(IEncumberedWallet encumberedWallet) EIP712("SnapshotEncumbrancePolicy", "0.0.1") {
        walletContract = encumberedWallet;
    }

    function notifyEncumbranceEnrollment(
        address _accountOwner,
        address account,
        uint256 expiration,
        bytes calldata
    ) public {
        require(msg.sender == address(walletContract), "Not wallet contract");
        require(expiration >= block.timestamp, "Expiration is in the past");
        encumbranceExpiration[account] = expiration;
        enrollmentTimestamp[account] = block.timestamp;
        accountOwner[account] = _accountOwner;
    }

    // Try to prevent leaking to the caller of an allowed vote signer
    function amVoteSigner(
        address account,
        bytes32 proposal,
        address sender,
        uint256 startTimestamp,
        uint256 endTimestamp
    ) public view returns (bool) {
        require(accountOwner[account] == sender, "Unauthorized");
        require(enrollmentTimestamp[account] <= startTimestamp, "Enrollment too late");
        require(encumbranceExpiration[account] >= endTimestamp, "Encumbrance period too short");
        return allowedVoteSigner[account][proposal] == msg.sender;
    }

    function signOnBehalf(
        address account,
        bytes32 proposal,
        EIP712DomainParams memory domain,
        string calldata dataType,
        bytes calldata data
    ) public view returns (bytes memory) {
        // Note that in the case of self-authorizations, wallet owners can just
        // sign through the wallet contract directly
        require(msg.sender == allowedVoteSigner[account][proposal], "Wrong vote signer");
        require(keccak256(bytes(domain.name)) == keccak256(bytes("snapshot")), "Not a snapshot message");
        require(keccak256(bytes(dataType[:4])) == keccak256(bytes("Vote")), "Not a snapshot Vote");
        require(data.length == 256, "Incorrect vote data length");
        SnapshotVote2 memory vote = abi.decode(data, (SnapshotVote2));
        require(vote.proposal == proposal, "Wrong proposal");
        return walletContract.signEncumberedTypedData(account, domain, dataType, data);
    }

    function selfVoteSigner(address account, bytes32 proposal) public {
        setVoteSigner(account, proposal, msg.sender);
    }

    function setVoteSigner(address account, bytes32 proposal, address signer) public {
        require(accountOwner[account] == msg.sender, "Only account owner");
        require(signer != address(0), "Zero address");
        require(allowedVoteSigner[account][proposal] == address(0), "Vote signer already set");
        allowedVoteSigner[account][proposal] = signer;
        voteSignerTimestamp[account][proposal] = block.timestamp;
    }

    function messageAllowed(address, bytes calldata) public pure returns (bool) {
        return true;
    }

    function typedDataAllowed(
        address addr,
        EIP712DomainParams memory domain,
        string calldata dataType,
        bytes calldata data
    ) public view returns (bool) {
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
                uint256 voteTimestamp = voteSignerTimestamp[addr][vote.proposal];
                return (voteSigner == accountOwner[addr] && block.timestamp > voteTimestamp);
            }
            // Unrecognized vote type
            return false;
        }

        return true;
    }
}
