// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import {EIP712DomainParams} from "./EIP712Utils.sol";

interface IEncumberedWallet {
    function signEncumberedMessage(address account, bytes calldata message) external view returns (bytes memory);

    function signEncumberedTypedData(
        address account,
        EIP712DomainParams memory domain,
        string calldata dataType,
        bytes calldata data
    ) external view returns (bytes memory);
}
