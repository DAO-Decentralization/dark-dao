// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@oasisprotocol/sapphire-contracts/contracts/Sapphire.sol";

import "./PrivateKeyGenerator.sol";
import "./IBlockHeaderOracle.sol";

contract VoteSellingDarkDAO is PrivateKeyGenerator {
    IBlockHeaderOracle private ethBlockHeaderOracle;
    bytes private signingKey;
    bytes32 private macKey;
    address public darkDaoSignerAddress;

    constructor(IBlockHeaderOracle _ethBlockHeaderOracle) {
        ethBlockHeaderOracle = _ethBlockHeaderOracle;
        (signingKey, darkDaoSignerAddress) = generatePrivateKey("signer");
        macKey = bytes32(Sapphire.randomBytes(32, "macKey"));
    }

    // You MUST save the encryptedAddressInfo for after you deposit to this address!
    function generateDepositAddress(
        address depositor
    ) public view returns (address depositAddress, bytes memory encryptedAddressInfo) {
        bytes memory accountKey;
        (accountKey, depositAddress) = generatePrivateKey(bytes.concat("deposit", bytes20(depositAddress)));
        bytes32 nonce = bytes32(Sapphire.randomBytes(32, "depositNonce"));
        encryptedAddressInfo = Sapphire.encrypt(
            macKey,
            nonce,
            abi.encode(accountKey, depositAddress, depositor),
            "deposit"
        );
    }

    // Generates a deposit address whose ownership is determined by whoever registers it
    function generateDepositAddress() public view returns (address depositAddress, bytes memory encryptedAddressInfo) {
        return generateDepositAddress(address(0));
    }
}
