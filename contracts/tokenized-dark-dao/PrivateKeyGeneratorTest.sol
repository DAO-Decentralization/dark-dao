// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "./PrivateKeyGenerator.sol";

contract PrivateKeyGeneratorTest is PrivateKeyGenerator {
    function ethAddressFromPublicKeyExternal(bytes memory publicKey) public pure returns (address) {
        return ethAddressFromPublicKey(publicKey);
    }

    function decompressPublicKeyExternal(bytes memory compressedPublicKey) public view returns (bytes memory) {
        return decompressPublicKey(compressedPublicKey);
    }
}
