// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@oasisprotocol/sapphire-contracts/contracts/Sapphire.sol";

import "./PrivateKeyGenerator.sol";
import "./IBlockHeaderOracle.sol";
import {StorageProof, ProvethVerifier} from "./proveth/ProvethVerifier.sol";
import {VoteAuction} from "./VoteAuction.sol";

struct DepositReceipt {
    address recipient;
    uint256 amount;
    bytes32 depositId;
    bytes signature;
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
    // Storage slot of the balance mapping in the DAO token
    uint256 daoTokenBalanceSlot;
    // Minimum deposit amount
    uint256 minDeposit;

    address[] private addresses;
    mapping(address => bool) deposited;
    mapping(address => uint256) depositAmount;
    mapping(address => bytes) accountKeys;
    uint256 private totalDeposits = 0;
    uint256[] private depositBlockNumbers;
    DepositReceipt[] private deposits;

    constructor(
        IBlockHeaderOracle _ethBlockHeaderOracle,
        ProvethVerifier _stateVerifier,
        address _ethNvToken,
        address _ethDaoToken,
        uint256 _daoTokenBalanceSlot,
        uint256 _minDeposit,
        uint256 minimumBid,
        uint256 auctionDuration
    ) VoteAuction(minimumBid, auctionDuration) {
        ethBlockHeaderOracle = _ethBlockHeaderOracle;
        stateVerifier = _stateVerifier;
        ethNvToken = _ethNvToken;
        ethDaoToken = _ethDaoToken;
        daoTokenBalanceSlot = _daoTokenBalanceSlot;
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
        addresses.push(depositAddress);

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
        require(
            block.number > depositBlockNumbers[index],
            "Wait until the next block for the deposit receipt to be accepted"
        );
        return deposits[index];
    }

    function signVote(bytes32 proposalHash, uint256 option, uint256 addressIndex) public view returns (bytes memory) {
        require(getAuctionWinner(proposalHash) == msg.sender, "Only the auction winner can sign vote messages");
    }
}
