// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./IBlockHeaderOracle.sol";

contract TrivialBlockHeaderOracle is IBlockHeaderOracle, Ownable {
    mapping(uint256 => bytes32) public blockHeaders;

    function setBlockHeaderHash(uint256 _blockNumber, bytes32 _hash) external onlyOwner {
        blockHeaders[_blockNumber] = _hash;
    }

    function getBlockHeaderHash(uint256 _blockNumber) external view override returns (bytes32) {
        require(blockHeaders[_blockNumber] != 0, "No header found for this block");
        return blockHeaders[_blockNumber];
    }
}
