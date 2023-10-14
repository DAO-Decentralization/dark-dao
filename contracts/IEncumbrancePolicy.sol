// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import {EIP712DomainParams} from "./EIP712Utils.sol";

interface IEncumbrancePolicy {
    // The policy is contacted when the caller enrolls for some period of time
    // The policy may revert the enrollment if it wishes to reject the request
    function notifyEncumbranceEnrollment(
        address accountOwner,
        address account,
        uint256 expiration,
        bytes calldata data
    ) external;

    // Returns true if the message is allowed to be signed by the wallet owner during the encumbrance period
    // Note that this function has to be trustworthy; a malicious policy could allow itself to sign any message.
    function messageAllowed(address wallet, bytes calldata message) external view returns (bool);

    // Returns true if the message is allowed to be signed by the wallet owner during the encumbrance period
    // Note that this function has to be trustworthy; a malicious policy could allow itself to sign any typed data.
    function typedDataAllowed(
        address wallet,
        EIP712DomainParams memory domain,
        string calldata dataType,
        bytes calldata data
    ) external view returns (bool);
}
