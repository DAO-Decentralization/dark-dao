// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

interface IBlockHeaderOracle {
    function getBlockHeaderHash(uint256 blockNumber) external returns (bytes32);
}
