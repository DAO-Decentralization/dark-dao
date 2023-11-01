// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import "@oasisprotocol/sapphire-contracts/contracts/Sapphire.sol";

import "./PrivateKeyGenerator.sol";
import "./IBlockHashOracle.sol";
import {StorageProof, ProvethVerifier, TransactionProof} from "./proveth/ProvethVerifier.sol";
import {VoteAuction} from "./VoteAuction.sol";
import {EIP712DomainParams, EIP712Utils} from "../parsing/EIP712Utils.sol";
import {TransactionSerializer} from "../parsing/TransactionSerializer.sol";
import {Type2TxMessage, Type2TxMessageSigned} from "../parsing/EthereumTransaction.sol";

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
    // Trusted oracle for block hashes
    IBlockHashOracle private ethBlockHashOracle;
    // Library for verifying transaction inclusion and state proofs
    ProvethVerifier public stateVerifier;
    // Key that signs deposit authorization messages
    bytes private signingKey;
    // Public address of the key that signs authorization messages
    address public darkDaoSignerAddress;
    // Key that decrypts deposit key material
    bytes32 private depositAddressGenKey;
    // Entropy for creating unique deposit IDs
    bytes32 private depositIdRandomness;

    // Ethereum address where the Dark DAO token will be deployed
    // Calculate this in advance
    address public ethDdToken;
    // Ethereum address of the underlying DAO token
    address public ethDaoToken;
    // Network ID of the public EVM network (Ethereum)
    uint256 public ethChainId;
    // Storage slot of the balance mapping in the underlying DAO token contract
    uint256 public daoTokenBalanceSlot;
    // Minimum deposit amount
    uint256 public minDeposit;
    // Storage slot of the withdrawalAmounts mapping in the nonvoting token contract
    uint256 public ddTokenWithdrawalsSlot;
    // Deposit lockup, in seconds, after a deposit proof is given. After this
    // period, the depositor can get authorization to mint the DD tokens.
    uint256 public depositLockupDuration;

    // A list of Ethereum addresses controlled by the Dark DAO
    address[] private accounts;
    // The index of the Dark DAO account that is currently used for withdrawals
    uint256 private withdrawalAddressIndex = 0;
    // Known target-DAO token balance of Dark DAO controlled accounts
    mapping(address => uint256) daoTokenBalance;
    // Maps Dark DAO accounts to their private keys
    mapping(address => bytes) accountKeys;
    // Maps Dark DAO accounts to their current nonce
    mapping(address => uint256) accountNonces;
    // Total number of DAO tokens controlled by the Dark DAO (technically a lower bound)
    uint256 private totalDaoTokenBalance = 0;
    // Per-depositor timestamps of registered deposits
    mapping(address => uint256[]) private depositTimestamps;
    // Per-depositor deposit receipts
    mapping(address => DepositReceipt[]) private deposits;

    // Total bribes paid out to users
    uint256 private totalBribePayoutAmount = 0;
    // Total amount of the native token (ROSE) contributed in deposits
    uint256 private totalNativeDepositAmount = 0;

    // Records whether a particular DD token burn has been counted
    mapping(bytes32 => uint256) withdrawalState;
    // Maps target-DAO token recipients to the amount owed
    mapping(address => uint256) withdrawalOwed;
    // Maps target-DAO token recipients to the timestamp after which they can
    // sign withdrawal transactions
    mapping(address => uint256) withdrawalEnabled;

    constructor(
        IBlockHashOracle _ethBlockHashOracle,
        ProvethVerifier _stateVerifier,
        uint256 _ethChainId,
        address _ethDdToken,
        address _ethDaoToken,
        uint256 _daoTokenBalanceSlot,
        uint256 _ddTokenWithdrawalsSlot,
        uint256 _minDeposit,
        uint256 minimumBid,
        uint256 auctionDuration,
        uint256 _depositLockupDuration
    ) VoteAuction(minimumBid, auctionDuration) {
        ethBlockHashOracle = _ethBlockHashOracle;
        stateVerifier = _stateVerifier;
        ethChainId = _ethChainId;
        ethDdToken = _ethDdToken;
        ethDaoToken = _ethDaoToken;
        daoTokenBalanceSlot = _daoTokenBalanceSlot;
        ddTokenWithdrawalsSlot = _ddTokenWithdrawalsSlot;
        minDeposit = _minDeposit;
        depositLockupDuration = _depositLockupDuration;
        (signingKey, darkDaoSignerAddress) = generatePrivateKey("signer");
        depositAddressGenKey = bytes32(Sapphire.randomBytes(32, "depositAddressGenKey"));
        depositIdRandomness = bytes32(Sapphire.randomBytes(32, "depositIdRandomness"));
    }

    // Returns the total amount of the native token stored in this contract for
    // withdrawal by nvDAO token holders via the registerWithdrawal function
    function getNativeTokenBalance() private view returns (uint256) {
        return getTotalAuctionEarnings() + totalNativeDepositAmount - totalBribePayoutAmount;
    }

    // You MUST save the encryptedAddressInfo for after you deposit to this address!
    function generateDepositAddress(
        address depositor
    ) public view returns (address depositAddress, bytes memory wrappedAddressInfo) {
        bytes memory accountKey;
        (accountKey, depositAddress) = generatePrivateKey(bytes.concat("deposit", bytes20(depositor)));
        bytes32 nonce = bytes32(Sapphire.randomBytes(32, "depositNonce"));
        wrappedAddressInfo = abi.encode(
            Sapphire.encrypt(depositAddressGenKey, nonce, abi.encode(accountKey, depositAddress, depositor), "deposit"),
            nonce
        );
    }

    // TODO: Should we restrict access to this function to depositors?
    // Then at least you would have to participate with the minimum deposit in order to read this ratio
    function nativeDepositRequired(uint256 daoTokens) public view returns (uint256) {
        if (totalDaoTokenBalance == 0) {
            return 0;
        }
        require(daoTokens < 2 ** 128, "Amount too high");
        return (daoTokens * getNativeTokenBalance()) / totalDaoTokenBalance;
    }

    function registerDeposit(
        bytes memory wrappedAddressInfo,
        uint256 proofBlockNumber,
        StorageProof memory storageProof
    ) public payable {
        (bytes memory encryptedAddressInfo, bytes32 addressInfoNonce) = abi.decode(
            wrappedAddressInfo,
            (bytes, bytes32)
        );
        bytes memory addressInfo = Sapphire.decrypt(
            depositAddressGenKey,
            addressInfoNonce,
            encryptedAddressInfo,
            "deposit"
        );
        (bytes memory accountKey, address depositAddress, address ddTokenRecipient) = abi.decode(
            addressInfo,
            (bytes, address, address)
        );
        require(storageProof.addr == ethDaoToken, "Proof must be for the DAO token");
        // Follows the Solidity storage slot calculation for mappings
        uint256 storageSlot = uint256(keccak256(abi.encode(depositAddress, daoTokenBalanceSlot)));
        require(storageProof.storageSlot == storageSlot, "Proof must be for balanceOf(depositAddress) storage slot");
        require(
            keccak256(storageProof.rlpBlockHeader) == ethBlockHashOracle.getBlockHash(proofBlockNumber),
            "Block hash incorrect or not found in oracle"
        );
        // Prove
        uint256 depositedAmount = stateVerifier.validateStorageProof(storageProof);
        require(depositedAmount >= minDeposit, "Minimum deposit not reached");
        require(daoTokenBalance[depositAddress] == 0, "Deposit already used");
        daoTokenBalance[depositAddress] = depositedAmount;
        accountKeys[depositAddress] = accountKey;
        accounts.push(depositAddress);

        // Require deposits to be proportional to the current bribe value
        if (totalDaoTokenBalance > 0) {
            require(
                msg.value >= (depositedAmount * getNativeTokenBalance()) / totalDaoTokenBalance,
                "Value proportional to pre-existing Dark DAO earnings must be paid"
            );
        }
        totalNativeDepositAmount += msg.value;

        bytes32 depositId = keccak256(
            bytes.concat(bytes("deposit"), bytes20(ddTokenRecipient), bytes20(depositAddress), depositIdRandomness)
        );
        bytes32 messageHash = keccak256(abi.encode("deposit", ddTokenRecipient, depositedAmount, depositId));
        bytes memory signature = Sapphire.sign(
            Sapphire.SigningAlg.Secp256k1PrehashedKeccak256,
            signingKey,
            bytes.concat(messageHash),
            ""
        );
        totalDaoTokenBalance += depositedAmount;
        deposits[msg.sender].push(
            DepositReceipt({
                recipient: ddTokenRecipient,
                amount: depositedAmount,
                depositId: depositId,
                signature: signature
            })
        );
        depositTimestamps[msg.sender].push(block.timestamp);
    }

    function getDeposit(uint256 index) public view returns (DepositReceipt memory) {
        // Assumes execution and simulations only can happen on top of the latest Sapphire block
        require(
            block.timestamp > depositTimestamps[msg.sender][index] + depositLockupDuration,
            "Deposit is still locked"
        );
        return deposits[msg.sender][index];
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
        address payable bribesWithdrawalRecipient,
        uint256 proofBlockNumber,
        StorageProof memory storageProof
    ) public {
        require(
            msg.sender == burnSender || keccak256(bytes.concat(witness)) == nonceHash,
            "Correct account or witness required"
        );

        // Calculate withdrawalAmounts storage slot
        bytes32 storageKey = keccak256(abi.encode("withdrawal", burnSender, amount, nonceHash));
        uint256 storageSlot = uint256(keccak256(abi.encode(storageKey, ddTokenWithdrawalsSlot)));
        require(storageProof.addr == ethDdToken, "Proof must be for the nonvoting DAO derivative token");
        require(
            storageProof.storageSlot == storageSlot,
            "Proof must be for withdrawalAmounts(depositAddress) storage slot"
        );
        require(
            keccak256(storageProof.rlpBlockHeader) == ethBlockHashOracle.getBlockHash(proofBlockNumber),
            "Block hash incorrect or not found in oracle"
        );
        uint256 burnedAmount = stateVerifier.validateStorageProof(storageProof);
        require(amount == burnedAmount, "State proof shows withdrawal never happened");

        require(withdrawalState[storageKey] == 0, "Withdrawal already registered");
        withdrawalState[storageKey] = block.timestamp;

        // Try sending the amount owed; otherwise, it's forfeited
        uint256 bribeOwed = (getNativeTokenBalance() * amount) / totalDaoTokenBalance;
        bribesWithdrawalRecipient.transfer(bribeOwed);

        withdrawalOwed[withdrawalRecipient] += amount;
        withdrawalEnabled[withdrawalRecipient] = block.timestamp;
        totalBribePayoutAmount += bribeOwed;

        // Account for withdrawal
        totalDaoTokenBalance -= amount;
    }

    function getWithdrawalTransaction(
        uint256 nonce,
        address withdrawalRecipient,
        uint256 amountToWithdraw
    ) public view returns (bytes memory unsignedTx) {
        bytes4 transferSelector = bytes4(keccak256(bytes("transfer(address,uint256)")));
        bytes memory transferData = abi.encodeWithSelector(transferSelector, withdrawalRecipient, amountToWithdraw);
        unsignedTx = TransactionSerializer.serializeTransaction(
            Type2TxMessage({
                chainId: ethChainId,
                nonce: nonce,
                maxPriorityFeePerGas: 1 gwei,
                maxFeePerGas: 1_000 gwei,
                gasLimit: 100_000,
                destination: bytes.concat(bytes20(ethDaoToken)),
                amount: 0,
                payload: transferData
            })
        );
    }

    // Returns a signed Ethereum transaction from the first available deposit address
    // TODO: Leaks whether a particular account will receive DAO tokens from the Dark DAO
    function getSignedWithdrawalTransaction(
        address withdrawalRecipient
    ) public view returns (bytes memory unsignedTx, bytes memory signature) {
        address withdrawalAccount = accounts[withdrawalAddressIndex];
        uint256 nonce = accountNonces[withdrawalAccount];
        uint256 amountToWithdraw = Math.min(withdrawalOwed[withdrawalRecipient], daoTokenBalance[withdrawalAccount]);
        require(amountToWithdraw > 0, "A withdrawal is not due to this account");
        require(
            block.timestamp > withdrawalEnabled[withdrawalRecipient],
            "Withdrawal registration must be finalized in a block"
        );
        unsignedTx = getWithdrawalTransaction(nonce, withdrawalRecipient, amountToWithdraw);
        bytes32 unsignedTxHash = keccak256(unsignedTx);
        signature = Sapphire.sign(
            Sapphire.SigningAlg.Secp256k1PrehashedKeccak256,
            accountKeys[withdrawalAccount],
            bytes.concat(unsignedTxHash),
            ""
        );
    }

    function proveWithdrawalInclusion(
        address withdrawalRecipient,
        uint256 amountToWithdraw,
        Type2TxMessageSigned calldata signedTx,
        TransactionProof memory inclusionProof,
        uint256 proofBlockNumber
    ) public {
        // Calculate signer address
        bytes memory unsignedTxData = getWithdrawalTransaction(
            signedTx.transaction.nonce,
            withdrawalRecipient,
            amountToWithdraw
        );
        bytes32 unsignedTxHash = keccak256(unsignedTxData);
        bytes memory signature = bytes.concat(bytes32(signedTx.r), bytes32(signedTx.s), bytes1(uint8(27 + signedTx.v)));
        (address signer, ECDSA.RecoverError error) = ECDSA.tryRecover(unsignedTxHash, signature);
        require(error == ECDSA.RecoverError.NoError, "Invalid signature");

        // Ensure that this is an up-to-date withdrawal transaction
        address withdrawalAccount = accounts[withdrawalAddressIndex];
        require(signer == withdrawalAccount, "Wrong signer/not the current withdrawal account");
        require(signedTx.transaction.nonce == accountNonces[withdrawalAccount], "Nonce has already been accounted for");

        // Prove inclusion
        require(
            keccak256(inclusionProof.rlpBlockHeader) == ethBlockHashOracle.getBlockHash(proofBlockNumber),
            "Block hash incorrect or not found in oracle"
        );
        bytes memory includedTx = stateVerifier.validateTxProof(inclusionProof);
        bytes32 signedTxHash = keccak256(TransactionSerializer.serializeSignedTransaction(signedTx));
        require(keccak256(includedTx) == signedTxHash, "Inclusion proof of an incorrect or absent transaction");

        // Process the withdrawal
        withdrawalOwed[withdrawalRecipient] -= amountToWithdraw;

        // Find the next withdrawal address
        accountNonces[withdrawalAccount]++;
        daoTokenBalance[withdrawalAccount] -= amountToWithdraw;
        if (daoTokenBalance[withdrawalAccount] == 0) {
            withdrawalAddressIndex++;
        }
    }

    // Nice-to-have: Update DAO token balance (multiple deposits to same address), coordinate sharing other tokens
}
