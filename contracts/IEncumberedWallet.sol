// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

interface IEncumberedWallet {
    function signEncumberedMessage(address origin, uint256 walletIndex, bytes calldata message) external view returns (bytes memory);
}
