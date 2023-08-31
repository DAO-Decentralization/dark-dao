// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.0 <0.9.0;

// Uncomment this line to use console.log
import "hardhat/console.sol";

import "./elliptic-curve/EllipticCurve.sol";
import "./Secp256k1.sol";
import "@oasisprotocol/sapphire-contracts/contracts/Sapphire.sol";

contract KeyCoupling {
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
    
    function getPublicKey() public view returns (bytes memory) {
        return publicKey;
    }
    
    function getPublicAddress() public view returns (address) {
        return ethAddressFromPublicKey(this.decompressPublicKey(publicKey));
    }
    
    function derivePubKey(uint256 privKey) public pure returns (uint256, uint256) {
        return EllipticCurve.ecMul(
            privKey,
            Secp256k1.GX,
            Secp256k1.GY,
            Secp256k1.AA,
            Secp256k1.PP
        );
    }
    
    function decompressPublicKey(bytes calldata compressedPublicKey) public pure returns (bytes memory) {
        require(compressedPublicKey.length == 33, "Incorrect compressed pubkey format");
        return abi.encodePacked(
            compressedPublicKey[1:33],
            EllipticCurve.deriveY(uint8(compressedPublicKey[0]), uint256(bytes32(compressedPublicKey[1:33])),
                Secp256k1.AA, Secp256k1.BB, Secp256k1.PP)
        );
    }
    
    function ethAddressFromPublicKey(bytes memory q) public pure returns (address) {
        require(q.length == 64, "Incorrect bytes length");
        bytes32 publicKeyKeccak = keccak256(q);
        return address(uint160(uint256(publicKeyKeccak)));
    }
    
    function ethAddressFromPublicKey(uint256 qx, uint256 qy) public pure returns (address) {
        bytes memory combined = abi.encodePacked(qx, qy);
        require(combined.length == 64, "Incorrect bytes length");
        bytes32 publicKeyKeccak = keccak256(combined);
        return address(uint160(uint256(publicKeyKeccak)));
    }
    
    function coupleKeys(uint256 privateKey1, uint256 privateKey2) public view returns (bytes memory, bytes memory) {
        require(msg.sender == owner, "You aren't the owner");
        
        (uint256 qx, uint256 qy) = derivePubKey(privateKey1);
        address address1 = ethAddressFromPublicKey(qx, qy);
        (qx, qy) = derivePubKey(privateKey2);
        address address2 = ethAddressFromPublicKey(qx, qy);
        
        bytes memory message = abi.encode(address1, address2);
        bytes32 messageHash = keccak256(message);
        bytes memory signature = Sapphire.sign(
            Sapphire.SigningAlg.Secp256k1PrehashedKeccak256,
            privateKey,
            abi.encodePacked(messageHash),
            "");
        return (message, signature);
    }
}
