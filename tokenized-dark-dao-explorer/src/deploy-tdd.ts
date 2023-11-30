import { Wallet, ethers } from "ethers";
import { TokenizedDarkDAO } from "../../scripts/tokenized-dark-dao";
import LimitedSupplyTestERC20Token from "../../artifacts/contracts/tokenized-dark-dao/test/LimitedSupplyTestERC20Token.sol/LimitedSupplyTestERC20Token.json";
import DarkDAOToken from "../../artifacts/contracts/tokenized-dark-dao/DarkDAOToken.sol/DarkDAOToken.json";
import VoteSellingDarkDAO from "../../artifacts/contracts/tokenized-dark-dao/VoteSellingDarkDAO.sol/VoteSellingDarkDAO.json";
import TrivialBlockHashOracle from "../../artifacts/contracts/tokenized-dark-dao/TrivialBlockHashOracle.sol/TrivialBlockHashOracle.json";
import ProvethVerifier from "../../artifacts/contracts/tokenized-dark-dao/proveth/ProvethVerifier.sol/ProvethVerifier.json";
import TransactionSerializer from "../../artifacts/contracts/parsing/TransactionSerializer.sol/TransactionSerializer.json";
import EIP712Utils from "../../artifacts/contracts/parsing/EIP712Utils.sol/EIP712Utils.json";

// The storage slot of the balances mapping in our TestERC20 token is 0
const daoTokenBalanceMappingSlot = "0x00";
// The withdrawals slot in the DD token contract is 12
const ddTokenWithdrawalsSlot = "0x0c";

// 1 ROSE
const minimumBid = 10n ** 18n * 1n;

// An auction for a proposal must begin earlier than this amount of time before the proposal ends
// for the votes to be usable.
// During testing, we use a very short time of 1 minute.
const auctionDuration = 60;

// Lockup period before DD token minting is allowed
const depositLockupDuration = 0;

// Use a different network that supports a state proof for testing the public network
// Example: geth
const ethTestChainId = 30_121;

function replaceLibraryReferences(
  bytecode: string,
  contractJson: any,
  libraryMapping: any,
): string {
  let result = bytecode;

  for (const fileReference in contractJson.linkReferences) {
    const reference = contractJson.linkReferences[fileReference];

    for (const contractName in reference) {
      const libraryLocations = reference[contractName];
      if (!libraryMapping.hasOwnProperty(contractName)) {
        throw new Error("Library mapping must include " + contractName);
      }

      for (const libraryLocation of libraryLocations) {
        const start = libraryLocation.start;
        const length = libraryLocation.length;

        // Get the library address from the library mapping
        const libraryAddress = libraryMapping[contractName];

        // Append the library address to the result using hexConcat
        result =
          result.slice(0, start * 2 + 2) +
          libraryAddress.slice(2) +
          result.slice((start + length) * 2 + 2);
      }
    }
  }

  return result;
}

function loadContractJson(
  contract: any,
  libraries: { [name: string]: string } = {},
): ethers.ContractFactory {
  const bytecode = replaceLibraryReferences(
    contract.bytecode,
    contract,
    libraries,
  );

  return new ethers.ContractFactory(
    new ethers.utils.Interface(contract.abi),
    bytecode,
  );
}

export async function deployTdd(
  ethWallet: Wallet,
  oasisWallet: Wallet,
  setStatus: (status: number) => void,
): Promise<{
  tdd: TokenizedDarkDAO;
  daoToken: ethers.Contract;
  blockHeaderOracle: ethers.Contract;
}> {
  setStatus(1);
  const daoToken = await loadContractJson(LimitedSupplyTestERC20Token)
    .connect(ethWallet)
    .deploy();
  await daoToken.deployTransaction.wait();
  setStatus(2);
  const blockHeaderOracle = await loadContractJson(TrivialBlockHashOracle)
    .connect(oasisWallet)
    .deploy();
  await blockHeaderOracle.deployTransaction.wait();
  setStatus(3);
  const stateVerifier = await loadContractJson(ProvethVerifier)
    .connect(oasisWallet)
    .deploy();
  await stateVerifier.deployTransaction.wait();
  setStatus(4);
  const transactionSerializer = await loadContractJson(TransactionSerializer)
    .connect(oasisWallet)
    .deploy();
  await transactionSerializer.deployTransaction.wait();
  setStatus(5);
  const eip712Utils = await loadContractJson(EIP712Utils)
    .connect(oasisWallet)
    .deploy();
  await eip712Utils.deployTransaction.wait();

  const ddTokenPredictedAddress = ethers.utils.getContractAddress({
    from: ethWallet.address,
    nonce: await ethWallet.provider.getTransactionCount(ethWallet.address),
  });

  setStatus(6);
  const dd = await loadContractJson(VoteSellingDarkDAO, {
    EIP712Utils: eip712Utils.address,
    TransactionSerializer: transactionSerializer.address,
  })
    .connect(oasisWallet)
    .deploy(
      blockHeaderOracle.address,
      stateVerifier.address,
      ethTestChainId,
      ddTokenPredictedAddress,
      daoToken.address,
      daoTokenBalanceMappingSlot,
      ddTokenWithdrawalsSlot,
      ethers.BigNumber.from(10n ** 18n * 8n),
      minimumBid,
      auctionDuration,
      depositLockupDuration,
    );

  setStatus(7);
  const ddToken = await loadContractJson(DarkDAOToken)
    .connect(ethWallet)
    .deploy(daoToken.address, await dd.darkDaoSignerAddress());
  await ddToken.deployTransaction.wait();
  setStatus(8);

  const tdd = await TokenizedDarkDAO.create(
    dd,
    ddToken,
    daoTokenBalanceMappingSlot,
    ddTokenWithdrawalsSlot,
  );
  return { tdd, daoToken, blockHeaderOracle };
}
