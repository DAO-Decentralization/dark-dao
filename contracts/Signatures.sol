// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.0 <0.9.0;

// Uncomment this line to use console.log
import "hardhat/console.sol";

import "@oasisprotocol/sapphire-contracts/contracts/Sapphire.sol";

contract Signatures1 {
    bytes private seed;
    bytes private publicKey;
    bytes private privateKey;
    address private owner;
    
    event Withdrawal(uint amount, uint when);

    constructor() {
        owner = payable(msg.sender);
        bytes memory empty;
        seed = Sapphire.randomBytes(32, empty);
        console.log("Seed:");
        console.logBytes(seed);
        (publicKey, privateKey) = Sapphire.generateSigningKeyPair(
            Sapphire.SigningAlg.Secp256k1PrehashedKeccak256,
            seed);
    }

    function showKeys() public view returns (bytes memory, bytes memory) {
        require(msg.sender == owner, "You aren't the owner");
        console.log("Public key:");
        console.logBytes(publicKey);
        console.log("Private key:");
        console.logBytes(privateKey);
        return (publicKey, privateKey);
    }
    
    /**
     @notice Sign an arbitrary message. NOTE: This message might be an Ethereum transaction or typed data, or anything.
     @param message The message to be signed.
     @return DER-encoded signature
     */
    function signMessage(bytes calldata message) public view returns (bytes memory) {
        require(msg.sender == owner, "You aren't the owner");
        bytes32 messageHash = keccak256(message);
        bytes memory signature = Sapphire.sign(
            Sapphire.SigningAlg.Secp256k1PrehashedKeccak256,
            privateKey,
            bytes.concat(messageHash),
            "");
        return signature;
    }
}
