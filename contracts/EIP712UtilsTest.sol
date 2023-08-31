// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "./EIP712Utils.sol";

/**
 * @title EIP-712 Utils Test
 * @dev Utility functions for generating and verifying EIP-712 signatures
 */
contract EIP712UtilsTest {
    bytes32 public constant EIP712_TYPE_HASH = EIP712Utils.EIP712_TYPE_HASH;
    /**
     * @dev Returns the domain separator for EIP-712 typehash
     * @param params EIP-712 domain parameters
     * @return bytes32 domain separator
     */
    function buildDomainSeparator(EIP712DomainParams memory params) public pure returns (bytes32) {
        return EIP712Utils.buildDomainSeparator(params);
    }
    
    function hashStruct(string calldata typeSig, bytes calldata encodedData) public pure returns (bytes32) {
        return EIP712Utils.hashStruct(typeSig, encodedData);
    }
    
    function getTypedDataHash(EIP712DomainParams memory params, string calldata typeSig, bytes calldata encodedData) public pure returns (bytes32) {
        return EIP712Utils.getTypedDataHash(params, typeSig, encodedData);
    }
}
