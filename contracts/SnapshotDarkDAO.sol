// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "./IEncumbrancePolicy.sol";
import "./IEncumberedWallet.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

contract SnapshotDarkDAO is IEncumbrancePolicy {
    IEncumberedWallet public walletContract;
    mapping (address => uint256) private enrollmentTime;
    bytes32 public votingPowerMerkleRoot;
    
    constructor(IEncumberedWallet encumberedWallet, bytes32 _votingPowerMerkleRoot) {
        walletContract = encumberedWallet;
        votingPowerMerkleRoot = _votingPowerMerkleRoot;
    }
    
    function verifyVotingPower(bytes32[] memory proof, address addr, uint256 amount) public view returns (bool) {
        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(addr, amount))));
        return MerkleProof.verify(proof, votingPowerMerkleRoot, leaf);
    }
    
    function notifyEncumbranceEnrollment(address wallet, uint256 expiration, bytes calldata) public {
        require(msg.sender == address(walletContract), "Not wallet contract");
        require(expiration >= block.timestamp, "Expiration is in the past");
        enrollmentTime[wallet] = block.timestamp;
    }
    
    function messageAllowed(address, bytes calldata) public pure returns (bool) {
        return true;
    }
    
    function typedDataAllowed(address, EIP712DomainParams memory domain, string calldata, bytes calldata) public pure returns (bool) {
        return keccak256(bytes(domain.name)) != keccak256(bytes("snapshot"));
    }
}
