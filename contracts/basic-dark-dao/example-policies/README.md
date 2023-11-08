## Example encumbrance policies
This directory has two example encumbrance policy contracts. Encumbrance policies restrict the owners of key-encumbered wallets created by the [Basic Encumbered Wallet contract](../BasicEncumberedWallet.sol) from signing certain types of messages until enrollment expires.

* **ExampleEncumbrancePolicy**: Encumbers all Ethereum signed messages, allowing the contract owner to have, exclusively, the ability to sign messages on behalf of enrolled encumbered accounts.
* **OffchainDAOBribingPolicy**: Demonstrates how to design an encumbrance policy for a hypothetical off-chain, message-based DAO voting system. This policy encumbers all messages that follow the format of the target system.
