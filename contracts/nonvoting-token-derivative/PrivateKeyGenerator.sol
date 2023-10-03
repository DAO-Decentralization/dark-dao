// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@oasisprotocol/sapphire-contracts/contracts/Sapphire.sol";

import "../elliptic-curve/EllipticCurve.sol";
import "../Secp256k1.sol";

contract PrivateKeyGenerator {
    function generatePrivateKey(
        bytes memory pers
    ) internal view returns (bytes memory privateKey, address publicAddress) {
        bytes memory seed = Sapphire.randomBytes(32, pers);
        bytes memory publicKey;
        (publicKey, privateKey) = Sapphire.generateSigningKeyPair(
            Sapphire.SigningAlg.Secp256k1PrehashedKeccak256,
            seed
        );
        require(publicKey.length > 0, "Public key length is 0");
        // Slices are only supported for calldata arrays
        bytes memory decompressed = decompressPublicKey(publicKey);
        publicAddress = ethAddressFromPublicKey(decompressed);
    }

    function ethAddressFromPublicKey(bytes memory q) internal pure returns (address) {
        require(q.length == 64, "Incorrect bytes length");
        bytes32 publicKeyKeccak = keccak256(q);
        return address(uint160(uint256(publicKeyKeccak)));
    }

    function decompressPublicKey(bytes memory compressedPublicKey) internal pure returns (bytes memory) {
        require(compressedPublicKey.length == 33, "Incorrect compressed pubkey format");

        // Get the key (slice off leading byte)
        bytes32 pubKeyX;
        assembly {
            // Add 0x20 to skip over the length field
            pubKeyX := mload(add(add(compressedPublicKey, 0x20), 1))
        }

        return
            bytes.concat(
                pubKeyX,
                bytes32(
                    EllipticCurve.deriveY(
                        uint8(compressedPublicKey[0]),
                        uint256(pubKeyX),
                        Secp256k1.AA,
                        Secp256k1.BB,
                        Secp256k1.PP
                    )
                )
            );
    }
}
