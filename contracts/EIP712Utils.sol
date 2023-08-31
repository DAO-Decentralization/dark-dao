// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

/**
 * @dev Describes an EIP-712 domain
 */
struct EIP712DomainParams {
    string name;
    string version;
    uint256 chainId;
    address verifyingContract;
}

/**
 * @title EIP-712 Utils
 * @dev Utility functions for generating and verifying EIP-712 signatures
 */
library EIP712Utils {
    bytes32 public constant EIP712_TYPE_HASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    /**
     * @dev Returns the domain separator for EIP-712 typehash
     * @param params EIP-712 domain parameters
     * @return bytes32 domain separator
     */
    function buildDomainSeparator(EIP712DomainParams memory params) public pure returns (bytes32) {
        return keccak256(abi.encode(EIP712_TYPE_HASH, keccak256(bytes(params.name)),
            keccak256(bytes(params.version)), params.chainId, params.verifyingContract));
    }
    
    function hashStruct(string calldata typeSig, bytes calldata encodedData) public pure returns (bytes32) {
        return keccak256(bytes.concat(keccak256(bytes(typeSig)), encodedData));
    }
    
    function getTypedDataHash(EIP712DomainParams memory params, string calldata typeSig, bytes calldata encodedData) public pure returns (bytes32) {
        return keccak256(bytes.concat(hex"19_01", buildDomainSeparator(params), hashStruct(typeSig, encodedData)));
    }
}
