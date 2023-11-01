// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "@oasisprotocol/sapphire-contracts/contracts/Sapphire.sol";

import "../elliptic-curve/EllipticCurve.sol";
import "../elliptic-curve/Secp256k1.sol";

import "./IEncumbrancePolicy.sol";
import "./IEncumberedWallet.sol";

import {EIP712DomainParams, EIP712Utils} from "../parsing/EIP712Utils.sol";

struct EncumberedAccount {
    address owner;
    uint256 index;
}

contract BasicEncumberedWallet is IEncumberedWallet {
    // Mapping to wallets; access must always be authorized
    mapping(address => mapping(uint => bytes)) private privateKeys;
    mapping(address => mapping(uint => bytes)) private publicKeys;
    mapping(address => mapping(uint => address)) private addresses;
    mapping(address => EncumberedAccount) private accounts;
    mapping(address => IEncumbrancePolicy) private encumbranceContract;
    mapping(address => uint256) private encumbranceExpiry;

    function ethAddressFromPublicKey(bytes memory q) public pure returns (address) {
        require(q.length == 64, "Incorrect bytes length");
        bytes32 publicKeyKeccak = keccak256(q);
        return address(uint160(uint256(publicKeyKeccak)));
    }

    function decompressPublicKey(bytes calldata compressedPublicKey) public pure returns (bytes memory) {
        require(compressedPublicKey.length == 33, "Incorrect compressed pubkey format");
        return
            abi.encodePacked(
                compressedPublicKey[1:33],
                EllipticCurve.deriveY(
                    uint8(compressedPublicKey[0]),
                    uint256(bytes32(compressedPublicKey[1:33])),
                    Secp256k1.AA,
                    Secp256k1.BB,
                    Secp256k1.PP
                )
            );
    }

    /**
     * @notice Create a new wallet
     * @param index Index of the new wallet. This number should be randomly
     * sampled to protect against certain privacy-related side channel attacks.
     */
    function createWallet(uint256 index) public {
        // Ensure that the wallet doesn't exist already
        require(publicKeys[msg.sender][index].length == 0, "Wallet exists");
        bytes memory empty;
        bytes memory seed = Sapphire.randomBytes(32, empty);
        bytes memory publicKey;
        bytes memory privateKey;
        (publicKey, privateKey) = Sapphire.generateSigningKeyPair(
            Sapphire.SigningAlg.Secp256k1PrehashedKeccak256,
            seed
        );

        require(publicKey.length > 0, "Public key length is 0");
        publicKeys[msg.sender][index] = publicKey;
        privateKeys[msg.sender][index] = privateKey;
        address addr = ethAddressFromPublicKey(BasicEncumberedWallet(address(this)).decompressPublicKey(publicKey));
        addresses[msg.sender][index] = addr;
        accounts[addr] = EncumberedAccount({owner: msg.sender, index: index});
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

    function enterEncumbranceContract(
        uint256 walletIndex,
        IEncumbrancePolicy policy,
        uint256 expiry,
        bytes calldata data
    ) public {
        // TODO: Extend to multiple encumbrance contracts
        require(expiry > block.timestamp, "Already expired");
        address account = addresses[msg.sender][walletIndex];
        require(encumbranceExpiry[account] == 0 || encumbranceExpiry[account] < block.timestamp, "Already encumbered");
        // TODO: Require address to have been initialized
        encumbranceContract[account] = policy;
        encumbranceExpiry[account] = expiry;

        // Notify the policy that encumbrance has begun
        policy.notifyEncumbranceEnrollment(msg.sender, account, expiry, data);
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
        address account = addresses[owner][walletIndex];
        IEncumbrancePolicy encContract = encumbranceContract[account];
        require(msg.sender == owner || msg.sender == address(encContract), "Not authorized");

        bool encumbranceExpired = (block.timestamp > encumbranceExpiry[account]);
        if (encumbranceExpired) {
            return true;
        }

        bool isContract = (msg.sender == address(encContract));
        // The user can't sign any messages the encumbrance contract reserves,
        // and the encumbrance contract can't sign any messages it does not reserve
        // TODO: Revisit if mutual exclusion is necessary
        bool messageIsEncumbered = !encContract.messageAllowed(account, message);
        return (!messageIsEncumbered && !isContract) || (messageIsEncumbered && isContract);
    }

    function typedDataAllowed(
        address owner,
        uint256 walletIndex,
        EIP712DomainParams memory domain,
        string calldata dataType,
        bytes calldata data
    ) private view returns (bool) {
        address account = addresses[owner][walletIndex];
        IEncumbrancePolicy encContract = encumbranceContract[account];
        require(msg.sender == owner || msg.sender == address(encContract), "Not authorized");

        bool encumbranceExpired = (block.timestamp > encumbranceExpiry[account]);
        if (encumbranceExpired) {
            return true;
        }

        bool isContract = (msg.sender == address(encContract));
        bool messageIsEncumbered = !encContract.typedDataAllowed(account, domain, dataType, data);
        return (!messageIsEncumbered && !isContract) || (messageIsEncumbered && isContract);
    }

    function signMessageAuthorized(
        address owner,
        uint256 walletIndex,
        bytes calldata message,
        bool isEncumbered
    ) private view returns (bytes memory) {
        bytes memory privateKey = privateKeys[owner][walletIndex];
        require(privateKey.length > 0, "Wallet does not exist");

        bool isTypedData = (message.length >= 2 && message[0] == hex"19" && message[1] == hex"01");
        address account = addresses[owner][walletIndex];
        require(
            !isTypedData || encumbranceExpiry[account] <= block.timestamp,
            "Typed data must be signed through signTypedData"
        );

        require(
            messageAllowed(owner, walletIndex, message) || isEncumbered,
            "Message not allowed by encumbrance contract"
        );

        bytes32 messageHash = keccak256(message);
        bytes memory signature = Sapphire.sign(
            Sapphire.SigningAlg.Secp256k1PrehashedKeccak256,
            privateKey,
            bytes.concat(messageHash),
            ""
        );
        return signature;
    }

    /**
     @notice Sign an arbitrary message. NOTE: This message might be an Ethereum transaction or typed data, or anything.
     @param message The message to be signed.
     @return DER-encoded signature
     */
    function signMessage(uint256 walletIndex, bytes calldata message) public view returns (bytes memory) {
        return signMessageAuthorized(msg.sender, walletIndex, message, false);
    }

    function signEncumberedMessage(address account, bytes calldata message) public view returns (bytes memory) {
        require(address(encumbranceContract[account]) == msg.sender, "Not encumbered by sender");
        require(block.timestamp < encumbranceExpiry[account], "Rental expired");
        EncumberedAccount memory acc = accounts[account];
        return signMessageAuthorized(acc.owner, acc.index, message, true);
    }

    function signTypedDataAuthorized(
        address owner,
        uint256 walletIndex,
        EIP712DomainParams memory domain,
        string calldata dataType,
        bytes calldata data
    ) private view returns (bytes memory) {
        bytes memory privateKey = privateKeys[owner][walletIndex];
        require(privateKey.length > 0, "Wallet does not exist");
        require(
            typedDataAllowed(owner, walletIndex, domain, dataType, data),
            "Typed data not allowed by encumbrance contract"
        );

        // Calculate hash
        bytes32 messageHash = EIP712Utils.getTypedDataHash(domain, dataType, data);
        bytes memory signature = Sapphire.sign(
            Sapphire.SigningAlg.Secp256k1PrehashedKeccak256,
            privateKey,
            bytes.concat(messageHash),
            ""
        );
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
    function signTypedData(
        uint256 walletIndex,
        EIP712DomainParams memory domain,
        string calldata dataType,
        bytes calldata data
    ) public view returns (bytes memory) {
        return signTypedDataAuthorized(msg.sender, walletIndex, domain, dataType, data);
    }

    /**
     @notice Sign typed data. NOTE: The contents of the data are not type checked.
     @param account The account that will sign the typed data.
     @param domain EIP-712 domain
     @param dataType Data type according to EIP-712
     @param data Struct containing the data contents
     @return DER-encoded signature
     */
    function signEncumberedTypedData(
        address account,
        EIP712DomainParams memory domain,
        string calldata dataType,
        bytes calldata data
    ) public view returns (bytes memory) {
        require(address(encumbranceContract[account]) == msg.sender, "Not encumbered by sender");
        require(block.timestamp < encumbranceExpiry[account], "Rental expired");
        EncumberedAccount memory acc = accounts[account];
        return signTypedDataAuthorized(acc.owner, acc.index, domain, dataType, data);
    }
}
