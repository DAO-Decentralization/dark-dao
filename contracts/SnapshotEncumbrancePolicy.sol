// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "./IEncumbrancePolicy.sol";
import "./IEncumberedWallet.sol";

contract SnapshotDarkDAO is IEncumbrancePolicy {
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
    
    function typedDataAllowed(address, EIP712DomainParams memory domain, string calldata dataType, bytes calldata data) public view returns (bool) {
        if (keccak256(bytes(domain.name)) != keccak256(bytes("snapshot"))) {
            return true;
        }
        return false;
    }
}
