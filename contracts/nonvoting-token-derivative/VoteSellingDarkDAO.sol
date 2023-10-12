// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@oasisprotocol/sapphire-contracts/contracts/Sapphire.sol";

import "./PrivateKeyGenerator.sol";
import "./IBlockHeaderOracle.sol";
import {StorageProof, ProvethVerifier} from "./proveth/ProvethVerifier.sol";
import {VoteAuction} from "./VoteAuction.sol";
import {EIP712DomainParams, EIP712Utils} from "../EIP712Utils.sol";

struct DepositReceipt {
    address recipient;
    uint256 amount;
    bytes32 depositId;
    bytes signature;
}

struct SnapshotVote2 {
    address from;
    bytes32 space;
    uint64 timestamp;
    bytes32 proposal;
    uint32 choice;
    bytes32 reason;
    bytes32 app;
    bytes32 metadata;
}

contract VoteSellingDarkDAO is PrivateKeyGenerator, VoteAuction {
    IBlockHeaderOracle private ethBlockHeaderOracle;
    ProvethVerifier public stateVerifier;
    bytes private signingKey;
    bytes32 private macKey;
    bytes32 private depositIdRandomness;
    address public darkDaoSignerAddress;

    // Ethereum address where the nonvoting DAO token will be deployed
    // Calculate this in advance
    address public ethNvToken;
    // Ethereum address of the underlying DAO token
    address public ethDaoToken;
    // Storage slot of the balance mapping in the underlying DAO token contract
    uint256 daoTokenBalanceSlot;
    // Minimum deposit amount
    uint256 minDeposit;
    // Storage slot of the withdrawalAmounts mapping in the nonvoting token contract
    uint256 nvTokenWithdrawalsSlot;

    address[] private accounts;
    mapping(address => bool) deposited;
    mapping(address => uint256) depositAmount;
    mapping(address => bytes) accountKeys;
    mapping(address => uint256) accountNonces;
    uint256 private totalDeposits = 0;
    uint256[] private depositBlockNumbers;
    DepositReceipt[] private deposits;

    mapping(bytes32 => uint256) withdrawalState;
    mapping(address => uint256) withdrawalsOwed;

    constructor(
        IBlockHeaderOracle _ethBlockHeaderOracle,
        ProvethVerifier _stateVerifier,
        address _ethNvToken,
        address _ethDaoToken,
        uint256 _daoTokenBalanceSlot,
        uint256 _nvTokenWithdrawalsSlot,
        uint256 _minDeposit,
        uint256 minimumBid,
        uint256 auctionDuration
    ) VoteAuction(minimumBid, auctionDuration) {
        ethBlockHeaderOracle = _ethBlockHeaderOracle;
        stateVerifier = _stateVerifier;
        ethNvToken = _ethNvToken;
        ethDaoToken = _ethDaoToken;
        daoTokenBalanceSlot = _daoTokenBalanceSlot;
        nvTokenWithdrawalsSlot = _nvTokenWithdrawalsSlot;
        minDeposit = _minDeposit;
        (signingKey, darkDaoSignerAddress) = generatePrivateKey("signer");
        macKey = bytes32(Sapphire.randomBytes(32, "macKey"));
        depositIdRandomness = bytes32(Sapphire.randomBytes(32, "depositIdRandomness"));
    }

    // You MUST save the encryptedAddressInfo for after you deposit to this address!
    function generateDepositAddress(
        address depositor
    ) public view returns (address depositAddress, bytes memory wrappedAddressInfo) {
        bytes memory accountKey;
        (accountKey, depositAddress) = generatePrivateKey(bytes.concat("deposit", bytes20(depositor)));
        bytes32 nonce = bytes32(Sapphire.randomBytes(32, "depositNonce"));
        wrappedAddressInfo = abi.encode(
            Sapphire.encrypt(macKey, nonce, abi.encode(accountKey, depositAddress, depositor), "deposit"),
            nonce
        );
    }

    function registerDeposit(
        bytes memory wrappedAddressInfo,
        uint256 proofBlockNumber,
        StorageProof memory storageProof
    ) public {
        (bytes memory encryptedAddressInfo, bytes32 addressInfoNonce) = abi.decode(
            wrappedAddressInfo,
            (bytes, bytes32)
        );
        bytes memory addressInfo = Sapphire.decrypt(macKey, addressInfoNonce, encryptedAddressInfo, "deposit");
        (bytes memory accountKey, address depositAddress, address nvTokenRecipient) = abi.decode(
            addressInfo,
            (bytes, address, address)
        );
        require(storageProof.addr == ethDaoToken, "Proof must be for the DAO token");
        // Follows the Solidity storage slot calculation for mappings
        uint256 storageSlot = uint256(keccak256(abi.encode(depositAddress, daoTokenBalanceSlot)));
        require(storageProof.storageSlot == storageSlot, "Proof must be for balanceOf(depositAddress) storage slot");
        require(
            keccak256(storageProof.rlpBlockHeader) == ethBlockHeaderOracle.getBlockHeaderHash(proofBlockNumber),
            "Block hash incorrect or not found in oracle"
        );
        // Prove
        uint256 depositedAmount = stateVerifier.validateStorageProof(storageProof);
        require(depositedAmount > minDeposit, "Minimum deposit not reached");
        require(!deposited[depositAddress], "Deposit already used");
        deposited[depositAddress] = true;
        depositAmount[depositAddress] = depositedAmount;
        accountKeys[depositAddress] = accountKey;
        accounts.push(depositAddress);

        bytes32 depositId = keccak256(
            bytes.concat(bytes("deposit"), bytes20(nvTokenRecipient), bytes20(depositAddress), depositIdRandomness)
        );
        bytes32 messageHash = keccak256(abi.encode("deposit", nvTokenRecipient, depositedAmount, depositId));
        bytes memory signature = Sapphire.sign(
            Sapphire.SigningAlg.Secp256k1PrehashedKeccak256,
            signingKey,
            bytes.concat(messageHash),
            ""
        );
        totalDeposits += depositedAmount;
        deposits.push(
            DepositReceipt({
                recipient: nvTokenRecipient,
                amount: depositedAmount,
                depositId: depositId,
                signature: signature
            })
        );
        depositBlockNumbers.push(block.number);
    }

    function getDeposit(uint256 index) public view returns (DepositReceipt memory) {
        // Assumes execution and simulations only can happen on top of the latest Sapphire block
        require(
            block.number > depositBlockNumbers[index],
            "Wait until the next block for the deposit receipt to be accepted"
        );
        return deposits[index];
    }

    function _typedDataAllowed(
        address sender,
        EIP712DomainParams memory domain,
        string calldata dataType,
        bytes calldata data
    ) private view returns (bool) {
        if (keccak256(bytes(domain.name)) != keccak256(bytes("snapshot"))) {
            return false;
        }

        if (keccak256(bytes(dataType[:4])) == keccak256(bytes("Vote"))) {
            if (keccak256(bytes(dataType)) == 0xaeb61c95cf08a4ae90fd703eea32d24d7936280c3c5b611ad2c40211583d4c85) {
                require(data.length == 256, "Incorrect vote data length");
                SnapshotVote2 memory vote = abi.decode(data, (SnapshotVote2));
                require(getAuctionWinner(vote.proposal) == sender, "Only the auction winner can sign vote messages");
                return true;
            }
            // Unrecognized vote type
            return false;
        }
        return false;
    }

    function typedDataAllowed(
        EIP712DomainParams memory domain,
        string calldata dataType,
        bytes calldata data
    ) public view returns (bool) {
        return _typedDataAllowed(msg.sender, domain, dataType, data);
    }

    function signVote(
        address wallet,
        EIP712DomainParams memory domain,
        string calldata dataType,
        bytes calldata data
    ) public view returns (bytes memory) {
        require(_typedDataAllowed(msg.sender, domain, dataType, data), "Unauthorized message type");
        bytes memory privateKey = accountKeys[wallet];
        require(privateKey.length > 0, "Wallet does not exist");

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

    function registerWithdrawal(
        address burnSender,
        uint256 amount,
        bytes32 nonceHash,
        bytes32 witness,
        address withdrawalRecipient,
        uint256 proofBlockNumber,
        StorageProof memory storageProof
    ) public {
        require(
            msg.sender == burnSender || keccak256(bytes.concat(witness)) == nonceHash,
            "Correct account or witness required"
        );

        // Calculate withdrawalAmounts storage slot
        bytes32 storageKey = keccak256(abi.encode("withdrawal", burnSender, amount, nonceHash));
        uint256 storageSlot = uint256(keccak256(abi.encode(storageKey, nvTokenWithdrawalsSlot)));
        require(storageProof.addr == ethNvToken, "Proof must be for the nonvoting DAO derivative token");
        require(
            storageProof.storageSlot == storageSlot,
            "Proof must be for withdrawalAmounts(depositAddress) storage slot"
        );
        require(
            keccak256(storageProof.rlpBlockHeader) == ethBlockHeaderOracle.getBlockHeaderHash(proofBlockNumber),
            "Block hash incorrect or not found in oracle"
        );

        require(withdrawalState[storageKey] == 0, "Withdrawal already registered");
        withdrawalState[storageKey] = 1;
        withdrawalsOwed[withdrawalRecipient] += amount;
    }

    // Returns a signed Ethereum transaction from the first available deposit address
    /*
    function getWithdrawalTransaction(
        address withdrawalRecipient
    ) public view returns (bytes memory) {
        return "Not implemented";
    }
    */
}
