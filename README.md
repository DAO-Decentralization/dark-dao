# dark-dao
An implementation of key-encumbered wallet and encumbrance policy contracts that can be used to create Dark DAOs.

### Current status
We are still actively working on the implementation. There are a few things left to do:
- [X] Encumbering access to signing voting-related messages while allowing transactions and other messages to be signed
- [X] Signing voting transactions from within a Dark DAO encumbrance policy contract (see the [example](contracts/ExampleEncumbrancePolicy.sol))
- [X] Dark DAO management (e.g. payments)

## Test locally
Run an Oasis Sapphire dev environment:
```
docker run -it -p8545:8545 -p8546:8546 ghcr.io/oasisprotocol/sapphire-dev -to "0x72A6CF1837105827077250171974056B40377488"
```

Note that these accounts are ephemeral and will be lost when you restart. Also, the TEE environment in the development environment is simulated.

Run the test cases:
```shell
npx hardhat test --network dev
```

### Contributions
TypeScript code formatting:
```
npx xo --fix
```

Solidity code formatting:
```
npm run format-solidity
```

### Acknowledgements
The [elliptic curve contracts](contracts/elliptic-curve) are based on [elliptic-curve-solidity](https://github.com/witnet/elliptic-curve-solidity) under the MIT license.

The nonvoting token derivative uses [Proveth](https://github.com/lorenzb/proveth) in its Dark DAO contract to verify proofs of DAO token balances on Ethereum.
