// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

contract NonVotingDAOToken is ERC20, ERC20Permit {
    address public underlyingToken;

    constructor(address _underlyingToken) ERC20("Non-Voting DAO Token", "NVT") ERC20Permit("Non-Voting DAO Token") {
        underlyingToken = _underlyingToken;
    }
}
