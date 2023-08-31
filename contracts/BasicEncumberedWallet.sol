// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

// Uncomment this line to use console.log
import "hardhat/console.sol";
import "@oasisprotocol/sapphire-contracts/contracts/Sapphire.sol";

import "./elliptic-curve/EllipticCurve.sol";
import "./Secp256k1.sol";

import "./IEncumbrancePolicy.sol";
import "./IEncumberedWallet.sol";

import {EIP712DomainParams, EIP712Utils} from "./EIP712Utils.sol";

contract BasicEncumberedWallet is IEncumberedWallet {
    // Mapping to wallets; access must always be authorized
    mapping(address => mapping(uint => bytes)) private privateKeys;
    mapping(address => mapping(uint => bytes)) private publicKeys;
    mapping(address => mapping(uint => address)) private addresses;
    
    mapping(address => mapping(uint => IEncumbrancePolicy)) private encumbermentContract;
    mapping(address => mapping(uint => uint256)) private encumbermentExpiry;
    
    function ethAddressFromPublicKey(bytes memory q) public pure returns (address) {
        require(q.length == 64, "Incorrect bytes length");
        bytes32 publicKeyKeccak = keccak256(q);
        return address(uint160(uint256(publicKeyKeccak)));
    }
    
    function decompressPublicKey(bytes calldata compressedPublicKey) public pure returns (bytes memory) {
        require(compressedPublicKey.length == 33, "Incorrect compressed pubkey format");
        return abi.encodePacked(
            compressedPublicKey[1:33],
            EllipticCurve.deriveY(uint8(compressedPublicKey[0]), uint256(bytes32(compressedPublicKey[1:33])),
                Secp256k1.AA, Secp256k1.BB, Secp256k1.PP)
        );
    }
    
    function createWallet(uint256 index) public {
        // Ensure that the wallet doesn't exist already
        require(publicKeys[msg.sender][index].length == 0, "Wallet exists");
        console.log("Existing public key:");
        //console.logBytes(publicKeys[msg.sender][index]);
        bytes memory empty;
        bytes memory seed = Sapphire.randomBytes(32, empty);
        console.log("Seed:");
        console.logBytes(seed);
        bytes memory publicKey;
        bytes memory privateKey;
        (publicKey, privateKey) = Sapphire.generateSigningKeyPair(
            Sapphire.SigningAlg.Secp256k1PrehashedKeccak256,
            seed);
        
        require(publicKey.length > 0, "Public key length is 0");
        publicKeys[msg.sender][index] = publicKey;
        privateKeys[msg.sender][index] = privateKey;
        addresses[msg.sender][index] = ethAddressFromPublicKey(BasicEncumberedWallet(address(this)).decompressPublicKey(publicKey));
    }
    
    function getPublicKey(uint256 walletIndex) public view returns (bytes memory) {
        bytes memory publicKey = publicKeys[msg.sender][walletIndex];
        //require(publicKey.length > 0, "Wallet does not exist");
        return publicKey;
    }
    
    function getAddress(uint256 walletIndex) public view returns (address) {
        address walletAddress = addresses[msg.sender][walletIndex];
        require(walletAddress != address(0), "Wallet does not exist");
        return walletAddress;
    }
    
    function getEncumberedPublicKey(address owner, uint256 walletIndex) public view returns (bytes memory) {
        IEncumbrancePolicy encContract = encumbermentContract[owner][walletIndex];
        require(msg.sender == owner || msg.sender == address(encContract), "Not authorized");
        bool encumbranceExpired = (block.timestamp > encumbermentExpiry[owner][walletIndex]);
        require(msg.sender == owner || !encumbranceExpired, "Expired");
        
        bytes memory publicKey = publicKeys[owner][walletIndex];
        return publicKey;
    }
    
    function enterEncumbranceContract(uint256 walletIndex, IEncumbrancePolicy policy, uint256 expiry, bytes calldata data) public {
        // TODO: Extend to multiple encumberment contracts
        require(expiry > block.timestamp, "Already expired");
        require(encumbermentExpiry[msg.sender][walletIndex] == 0 || encumbermentExpiry[msg.sender][walletIndex] < block.timestamp, "Already encumbered");
        // TODO: Require address to have been initialized
        encumbermentContract[msg.sender][walletIndex] = policy;
        encumbermentExpiry[msg.sender][walletIndex] = expiry;
        
        // Notify the policy that encumbrance has begun
        policy.notifyEncumbranceEnrollment(addresses[msg.sender][walletIndex], expiry, data);
    }
    
    /*
    function createAndEnterEncumbrance(uint256 walletIndex, IEncumbrancePolicy policy, uint256 expiry, bytes calldata data) public {
        // TODO: Signal that the wallet was created for this purpose
        // TODO: Vulnerable to reorg/replay attacks? Maybe add custom entropy for the policy address
        enterEncumbranceContract(walletIndex, policy, expiry, data);
    }
    */
    
    // NOTE: The encumbrance policy controls this
    function messageAllowed(address owner, uint256 walletIndex, bytes calldata message) public view returns (bool) {
        IEncumbrancePolicy encContract = encumbermentContract[owner][walletIndex];
        require(msg.sender == owner || msg.sender == address(encContract), "Not authorized");
        
        bool encumbranceExpired = (block.timestamp > encumbermentExpiry[owner][walletIndex]);
        if (encumbranceExpired) {
            return true;
        }
        
        bool isContract = (msg.sender == address(encContract));
        // The user can't sign any messages the encumbrance contract reserves,
        // and the encumbrance contract can't sign any messages it does not reserve
        // TODO: Revisit if mutual exclusion is necessary
        bool messageIsEncumbered = !encContract.messageAllowed(addresses[owner][walletIndex], message);
        return (!messageIsEncumbered && !isContract) || (messageIsEncumbered && isContract);
    }
    
    function typedDataAllowed(address owner, uint256 walletIndex, EIP712DomainParams memory domain, string calldata dataType, bytes calldata data) private view returns (bool) {
        IEncumbrancePolicy encContract = encumbermentContract[owner][walletIndex];
        require(msg.sender == owner || msg.sender == address(encContract), "Not authorized");
        
        bool encumbranceExpired = (block.timestamp > encumbermentExpiry[owner][walletIndex]);
        if (encumbranceExpired) {
            return true;
        }
        
        bool isContract = (msg.sender == address(encContract));
        bool messageIsEncumbered = !encContract.typedDataAllowed(addresses[owner][walletIndex], domain, dataType, data);
        return (!messageIsEncumbered && !isContract) || (messageIsEncumbered && isContract);
    }
    
    function signMessageAuthorized(address owner, uint256 walletIndex, bytes calldata message) private view returns (bytes memory) {
        bytes memory privateKey = privateKeys[owner][walletIndex];
        require(privateKey.length > 0, "Wallet does not exist");
        
        bool isTypedData = (message.length >= 2 && message[0] == hex"19" && message[1] == hex"01");
        require(!isTypedData || encumbermentExpiry[owner][walletIndex] <= block.timestamp, "Typed data must be signed through signTypedData");
        
        require(messageAllowed(msg.sender, walletIndex, message), "Message not allowed by encumberment contract");
        
        bytes32 messageHash = keccak256(message);
        bytes memory signature = Sapphire.sign(
            Sapphire.SigningAlg.Secp256k1PrehashedKeccak256,
            privateKey,
            bytes.concat(messageHash),
            "");
        return signature;
    }
    
    /**
     @notice Sign an arbitrary message. NOTE: This message might be an Ethereum transaction or typed data, or anything.
     @param message The message to be signed.
     @return DER-encoded signature
     */
    function signMessage(uint256 walletIndex, bytes calldata message) public view returns (bytes memory) {
        return signMessageAuthorized(msg.sender, walletIndex, message);
    }
    
    function signEncumberedMessage(address origin, uint256 walletIndex, bytes calldata message) public view returns (bytes memory) {
        require(address(encumbermentContract[origin][walletIndex]) == msg.sender, "Not encumbered by sender");
        require(block.timestamp < encumbermentExpiry[origin][walletIndex], "Rental expired");
        return signMessageAuthorized(origin, walletIndex, message);
    }
    
    function signTypedDataAuthorized(address owner, uint256 walletIndex, EIP712DomainParams memory domain, string calldata dataType, bytes calldata data) private view returns (bytes memory) {
        bytes memory privateKey = privateKeys[owner][walletIndex];
        require(privateKey.length > 0, "Wallet does not exist");
        require(typedDataAllowed(owner, walletIndex, domain, dataType, data), "Typed data not allowed by encumberment contract");
        
        // Calculate hash
        bytes32 messageHash = EIP712Utils.getTypedDataHash(domain, dataType, data);
        bytes memory signature = Sapphire.sign(
            Sapphire.SigningAlg.Secp256k1PrehashedKeccak256,
            privateKey,
            bytes.concat(messageHash),
            "");
        return signature;
    }
    
    /**
     @notice Sign typed data. NOTE: The contents of the data are not type checked.
     @param walletIndex The wallet that will sign the typed data.
     @param domain EIP-712 domain
     @param dataType Data type according to EIP-712
     @param data Struct containing the data contents
     @return DER-encoded signature
     */
    function signTypedData(uint256 walletIndex, EIP712DomainParams memory domain, string calldata dataType, bytes calldata data) public view returns (bytes memory) {
        return signTypedDataAuthorized(msg.sender, walletIndex, domain, dataType, data);
    }
}
