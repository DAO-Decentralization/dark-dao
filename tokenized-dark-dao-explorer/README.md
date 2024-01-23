# Tokenized Dark DAO "Lite" Explorer

Experiment with a tokenized Dark DAO

## Running

### Setup

Install dependencies and ensure that the Dark DAO contracts have been compiled by Hardhat in the root directory of the repo:

```
# Install dependencies
npm install
# Ensure contract artifacts are produced
cd .. && npx hardhat compile
cd tokenized-dark-dao-explorer
```

Begin both the geth and Oasis devnets, as described in the main Readme. Then, you can run the explorer with these commands:

```
# Run a development web server
npm run dev
```

You can find the interface at `http://localhost:5173`.

## Development

Style code properly with

```
npx prettier -w .
```
