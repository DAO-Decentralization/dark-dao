# dark-dao
An implementation of key-encumbered wallet and encumbrance policy contracts that can be used to create Dark DAOs, organizations built for trustworthy vote-selling.

In this repository, we show two different Dark DAO "flavors":
* A Basic Dark DAO that demonstrates simple vote-buying between a briber and vote sellers. Vote sellers must store their DAO tokens whose voting power they wish to sell inside an encumbered account that is controlled by a key-encumbered wallet smart contract.
* A user-friendly Tokenized Dark DAO "Lite" that automatically sells user voting power at auction. It is accessible to ordinary users via an ERC-20 DAO token derivative. Key encumbrance is managed entirely by the Dark DAO contract.

## Details
In order for trustworthy DAO vote-selling to be possible, the private key associated with the account that is doing the selling must be encumbered inside a trusted execution enclave (TEE) so that the vote-seller can rent the ability to sign DAO votes from his or her account solely to the vote-buyer. This way, the account holder cannot change or override the vote-buyer's votes. To that end, we use Oasis Sapphire as a backend to store key material and further hide vote-selling activities.

## Test locally
Requirements:
* Docker
* NodeJS
* geth

First, install the dependencies:
```
npm i
```

Run an Oasis Sapphire dev environment:
```
docker run -it -p8545:8545 -p8546:8546 ghcr.io/oasisprotocol/sapphire-dev -to "0x72A6CF1837105827077250171974056B40377488"
```

Note that these accounts are ephemeral and will be lost when you restart. Also, the TEE environment in the development environment is simulated.

The nonvoting token derivative test cases require a local development network using `geth`:
```shell
cd geth-devnet
# Create a network using the genesis.json file
./init_geth_devnet.sh
# Run the dev network
./run_geth_devnet.sh
```

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
