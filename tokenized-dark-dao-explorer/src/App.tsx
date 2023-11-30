import { useState, useContext } from "react";
import { ethers } from "ethers";
import {
  TransactionReceipt,
  TransactionResponse,
} from "@ethersproject/providers";
import * as sapphire from "@oasisprotocol/sapphire-paratime";
import { FaSpinner } from "react-icons/fa";
import "./App.css";
import Erc20TokenColumn from "./components/Erc20TokenColumn";
import { TokenizedDarkDAO } from "../../scripts/tokenized-dark-dao";
import ProviderContext from "./ProviderContext";
import { deployTdd } from "./deploy-tdd.ts";
import Balance from "./Balance";
import ChecklistItem from "./components/ChecklistItem";
import { erc20Interface } from "./abis";
import "./PulsingButton.css";
import { useErc20Balance, useWithdrawalOwed } from "./hooks";

interface DepositInfo {
  depositAddress: string;
  wrappedAddressInfo: string;
  deposited: boolean;
  depositInProgress: boolean;
  receipt?: TransactionReceipt;
  submittedProof: boolean;
  proofInProgress: boolean;
  proofIndex: number;
  mintAuth: boolean;
  mintInProgress: boolean;
  minted: boolean;
}

interface BurnInfo {
  witness: Uint8Array;
  nonceHash: string;
  tx: TransactionResponse;
  burnAmount: bigint;
}

function App() {
  const [tdd, setTdd] = useState<TokenizedDarkDAO | null>(null);
  const [blockHeaderOracle, setBlockHeaderOracle] =
    useState<ethers.Contract | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deployStatus, setDeployStatus] = useState<number>(0);
  const [depositAddresses, setDepositAddresses] = useState<DepositInfo[]>([]);
  const [proofIndexCount, setProofIndexCount] = useState<number>(0);
  const [burnInfo, setBurnInfo] = useState<BurnInfo | null>(null);
  const [burnInProgress, setBurnInProgress] = useState<boolean>(false);

  const providers = useContext(ProviderContext);
  const ddTokenBalance = useErc20Balance(
    providers.ethProvider,
    tdd?.ddToken?.address,
    providers.ethWallet.address,
  );
  const withdrawalOwed = useWithdrawalOwed(tdd, providers.ethWallet.address);

  async function deploy() {
    try {
      const {
        tdd,
        daoToken: _daoToken,
        blockHeaderOracle,
      } = await deployTdd(
        providers.ethWallet.connect(providers.ethProvider),
        sapphire.wrap(providers.oasisWallet.connect(providers.oasisProvider)),
        (status: number) => setDeployStatus(status),
      );
      setTdd(tdd);
      setBlockHeaderOracle(blockHeaderOracle);
    } catch (error: any) {
      setError(error.toString());
    }
  }

  async function getDepositAddress() {
    try {
      if (tdd === null) {
        throw new Error("Tokenized Dark DAO not set up yet");
      }
      const depositInfo = await tdd.generateDepositAddress(
        providers.ethWallet.address,
      );
      const newDepositAddresses = [
        ...depositAddresses,
        {
          ...depositInfo,
          deposited: false,
          depositInProgress: false,
          submittedProof: false,
          proofInProgress: false,
          proofIndex: 0,
          mintAuth: false,
          mintInProgress: false,
          minted: false,
        },
      ];
      setDepositAddresses(newDepositAddresses);
    } catch (error: any) {
      setError(error.toString());
    }
  }

  async function deposit(index: number) {
    try {
      if (tdd === null) {
        throw new Error("Tokenized Dark DAO not set up yet");
      }
      let newDepositAddresses = [...depositAddresses];
      newDepositAddresses[index].depositInProgress = true;
      setDepositAddresses(newDepositAddresses);

      const tokenContract = new ethers.Contract(
        tdd.targetDaoTokenAddress,
        erc20Interface,
        providers.ethWallet.connect(providers.ethProvider),
      );

      const transferTx = await tokenContract.transfer(
        newDepositAddresses[index].depositAddress,
        75n * 10n ** 18n,
      );
      const transferReceipt = await transferTx.wait();

      newDepositAddresses = [...depositAddresses];
      newDepositAddresses[index].deposited = true;
      newDepositAddresses[index].depositInProgress = false;
      newDepositAddresses[index].receipt = transferReceipt;
      setDepositAddresses(newDepositAddresses);
    } catch (error: any) {
      setError(error.toString());
    }
  }

  async function proveDeposit(index: number) {
    try {
      if (tdd === null || blockHeaderOracle === null) {
        throw new Error("Tokenized Dark DAO not set up yet");
      }
      let newDepositAddresses = [...depositAddresses];
      newDepositAddresses[index].proofInProgress = true;
      setDepositAddresses(newDepositAddresses);

      const proofBlock = await providers.ethProvider.getBlock("latest");
      await blockHeaderOracle
        .setBlockHash(proofBlock.number, proofBlock.hash)
        .then((tx: TransactionResponse) => tx.wait());
      const proof = await tdd.getDepositProof(
        newDepositAddresses[index],
        proofBlock.number,
      );
      const registration = await tdd.registerDeposit(
        newDepositAddresses[index].wrappedAddressInfo,
        proofBlock.number,
        proof,
      );
      const registrationReceipt = await registration.wait();
      if (registrationReceipt.status === 0) {
        throw new Error("registerDeposit failed");
      }

      newDepositAddresses = [...depositAddresses];
      newDepositAddresses[index].proofInProgress = false;
      newDepositAddresses[index].submittedProof = true;
      newDepositAddresses[index].proofIndex = proofIndexCount;
      setDepositAddresses(newDepositAddresses);
      setProofIndexCount(proofIndexCount + 1);
    } catch (error: any) {
      let newDepositAddresses = [...depositAddresses];
      newDepositAddresses[index].proofInProgress = false;
      setDepositAddresses(newDepositAddresses);
      setError(error.toString());
      throw error;
    }
  }

  async function mintAuth(index: number) {
    // This is actually taken care of already in the mintDDTokens function
    await new Promise<void>((resolve) => setTimeout(() => resolve(), 800));
    let newDepositAddresses = [...depositAddresses];
    newDepositAddresses[index].mintAuth = true;
    setDepositAddresses(newDepositAddresses);
  }

  async function mint(index: number) {
    try {
      if (tdd === null) {
        throw new Error("Tokenized Dark DAO not set up yet");
      }
      let newDepositAddresses = [...depositAddresses];
      newDepositAddresses[index].mintInProgress = true;
      setDepositAddresses(newDepositAddresses);

      console.log(newDepositAddresses[index].proofIndex);
      await tdd.mintDDTokens(newDepositAddresses[index].proofIndex);

      newDepositAddresses = [...depositAddresses];
      newDepositAddresses[index].mintInProgress = false;
      newDepositAddresses[index].minted = true;
      setDepositAddresses(newDepositAddresses);
    } catch (error: any) {
      let newDepositAddresses = [...depositAddresses];
      newDepositAddresses[index].mintInProgress = false;
      setDepositAddresses(newDepositAddresses);
      setError(error.toString());
      throw error;
    }
  }

  async function burn() {
    try {
      if (tdd === null) {
        throw new Error("Tokenized Dark DAO not set up yet");
      }
      if (burnInfo !== null) {
        throw new Error("Another burn has already begun");
      }

      setBurnInProgress(true);
      const ddTokenContract = new ethers.Contract(
        tdd.ddToken.address,
        erc20Interface,
        providers.ethWallet.connect(providers.ethProvider),
      );

      const balance = await ddTokenContract.balanceOf(
        providers.ethWallet.address,
      );
      if (balance.eq(0)) {
        return;
      }
      const burnAmount = balance;

      const newBurnInfo = await tdd.beginWithdrawal(burnAmount);
      await newBurnInfo.tx.wait();
      setBurnInfo({
        ...newBurnInfo,
        burnAmount: BigInt(burnAmount.toString()),
      });
      setBurnInProgress(false);
    } catch (error: any) {
      setError(error.toString());
      setBurnInProgress(false);
      throw error;
    }
  }
  async function proveBurn() {
    try {
      if (burnInfo === null || blockHeaderOracle === null || tdd === null) {
        throw new Error("Burn info is not available yet");
      }
      const proofBlock = await providers.ethProvider.getBlock("latest");
      await blockHeaderOracle
        .setBlockHash(proofBlock.number, proofBlock.hash)
        .then((tx: TransactionResponse) => tx.wait());

      const withdrawalTx = await tdd.registerWithdrawal(
        providers.ethWallet.address,
        burnInfo.burnAmount,
        burnInfo.nonceHash,
        burnInfo.witness,
        providers.ethWallet.address,
        providers.oasisWallet.address,
        proofBlock.number,
      );
      console.log(await withdrawalTx.wait());
      setBurnInfo(null);
    } catch (error: any) {
      setError(error.toString());
      throw error;
    }
  }

  async function submitWithdrawal() {
    try {
      const tx = await tdd.getWithdrawalTransaction(
        providers.ethWallet.address,
      );
      await providers.ethWallet
        .connect(providers.ethProvider)
        .sendTransaction({
          to: ethers.utils.parseTransaction(tx).from,
          value: ethers.utils.parseEther("0.1"),
        })
        .then((tx) => tx.wait());
      const result = await providers.ethProvider.sendTransaction(tx);
      const receipt = await result.wait();
      await blockHeaderOracle
        .setBlockHash(receipt.blockNumber, receipt.blockHash)
        .then((tx: TransactionResponse) => tx.wait());

      await tdd.proveWithdrawalInclusion(result.hash);
    } catch (error: any) {
      setError(error.toString());
      throw error;
    }
  }

  return (
    <div className="text-white">
      <h1 className="text-3xl font-semibold mb-4">
        Tokenized Dark DAO "Lite" Explorer
      </h1>
      <div className="flex" style={{ minHeight: "750px" }}>
        <div className="bg-blue-600 w-3/5 text-white flex flex-col p-2">
          <h2 className="text-xl font-semibold mb-2">Ethereum</h2>
          <div className="flex flex-row items-end grow space-x-2">
            <div className="flex flex-col items-center">
              {ddTokenBalance &&
                BigInt(ethers.utils.parseEther(ddTokenBalance).toString()) >
                  0n && (
                  <button
                    className={`bg-blue-400 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded transition-colors disabled:opacity-50 disabled:hover:bg-blue-400`}
                    onClick={() => burn()}
                    disabled={burnInProgress || burnInfo !== null}
                  >
                    <div className="flex inline-flex items-center">
                      {burnInProgress && (
                        <FaSpinner className="animate-spin text-gray-500 mr-2" />
                      )}{" "}
                      Redeem DD Tokens
                    </div>
                  </button>
                )}
              <div className="flex flex-row items-end">
                {tdd !== null && (
                  <>
                    <Erc20TokenColumn
                      provider={providers.ethProvider}
                      tokenAddress={tdd.ddToken.address}
                      holderAddress={providers.ethWallet.address}
                      tokenImage="dd-token2.svg"
                      caption="DD"
                    />
                    <Erc20TokenColumn
                      provider={providers.ethProvider}
                      tokenAddress={tdd.targetDaoTokenAddress}
                      holderAddress={providers.ethWallet.address}
                      tokenImage="dao-token.svg"
                      caption="DAO"
                    />
                  </>
                )}
              </div>
              <p className="font-bold">Your account</p>
              <Balance
                provider={providers.ethProvider}
                address={providers.ethWallet.address}
              />
            </div>
            {tdd !== null &&
              depositAddresses.map(
                (depositInfo: DepositInfo, index: number) => (
                  <div className="flex flex-col items-center" key={index}>
                    {!depositInfo.submittedProof &&
                      !depositInfo.proofInProgress && (
                        <button
                          className={`bg-blue-400 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded transition-colors disabled:opacity-50 disabled:hover:bg-blue-400`}
                          onClick={() => deposit(index)}
                          disabled={depositInfo.depositInProgress}
                        >
                          <div className="flex inline-flex items-center">
                            {depositInfo.depositInProgress && (
                              <FaSpinner className="animate-spin text-gray-500 mr-2" />
                            )}{" "}
                            Transfer
                          </div>
                        </button>
                      )}
                    {depositInfo.mintAuth && !depositInfo.minted && (
                      <button
                        className={`bg-blue-400 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded transition-colors disabled:opacity-50 disabled:hover:bg-blue-400`}
                        onClick={() => mint(index)}
                      >
                        <div className="flex inline-flex items-center">
                          Mint DD Tokens
                        </div>
                      </button>
                    )}
                    <div className="flex flex-row items-end">
                      <Erc20TokenColumn
                        provider={providers.ethProvider}
                        tokenAddress={tdd.targetDaoTokenAddress}
                        holderAddress={depositInfo.depositAddress}
                        tokenImage="dao-token.svg"
                        caption="DAO"
                        forceShow={true}
                      />
                    </div>
                    <p
                      className={`font-bold ${
                        depositInfo.deposited ? "text-pink-300" : ""
                      }`}
                    >
                      DD Acc #{index + 1}
                    </p>
                    <Balance
                      provider={providers.ethProvider}
                      address={depositInfo.depositAddress}
                    />
                  </div>
                ),
              )}
          </div>
        </div>
        <div className="bg-gray-400 w-2/5 p-2">
          <button
            className={`bg-gray-500 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded transition-colors disabled:opacity-50 ${
              deployStatus === 0
                ? "pulsing-button bg-blue-500 hover:bg-blue-700"
                : ""
            }`}
            onClick={deploy}
            disabled={!(providers.oasisProvider && providers.oasisProvider)}
          >
            Deploy
          </button>
          {deployStatus > 0 && deployStatus < 8 && (
            <div>
              <ChecklistItem step={1} currentStep={deployStatus}>
                DAO token
              </ChecklistItem>
              <ChecklistItem step={2} currentStep={deployStatus}>
                Block header oracle
              </ChecklistItem>
              <ChecklistItem step={3} currentStep={deployStatus}>
                State verifier
              </ChecklistItem>
              <ChecklistItem step={4} currentStep={deployStatus}>
                Transaction serializer library
              </ChecklistItem>
              <ChecklistItem step={5} currentStep={deployStatus}>
                EIP-712 library
              </ChecklistItem>
              <ChecklistItem step={6} currentStep={deployStatus}>
                Dark DAO contract
              </ChecklistItem>
              <ChecklistItem step={7} currentStep={deployStatus}>
                DD token
              </ChecklistItem>
            </div>
          )}
          {deployStatus >= 8 && (
            <ChecklistItem step={7} currentStep={deployStatus}>
              Deployment complete.
            </ChecklistItem>
          )}
        </div>
        <div className="bg-pink-600 w-3/5 flex flex-col p-2">
          <h2 className="text-xl font-semibold mb-2">Oasis</h2>
          {tdd !== null && (
            <div className="border-2 p-2">
              <div className="font-bold text-lg">Dark DAO Contract</div>
              <button
                className={`bg-pink-400 hover:bg-pink-700 text-white font-bold py-2 px-4 mb-3 rounded transition-colors disabled:opacity-50`}
                onClick={getDepositAddress}
              >
                Get deposit address
              </button>

              {burnInfo !== null && (
                <button
                  className={`bg-pink-400 hover:bg-pink-700 text-white font-bold py-2 px-4 rounded transition-colors disabled:opacity-50 disabled:hover:bg-pink-400`}
                  onClick={() => proveBurn()}
                >
                  <div className="flex inline-flex items-center">
                    Prove DD token burn
                  </div>
                </button>
              )}
              {withdrawalOwed && (
                <div>
                  <div>Withdrawal owed.</div>
                  <button
                    className={`bg-pink-400 hover:bg-pink-700 text-white font-bold py-2 px-4 rounded transition-colors disabled:opacity-50 disabled:hover:bg-pink-400`}
                    onClick={() => submitWithdrawal()}
                  >
                    <div className="flex inline-flex items-center">
                      Get, fund, & send withdrawal tx
                    </div>
                  </button>
                </div>
              )}
              <div className="flex flex-row flex-wrap space-x-3">
                {depositAddresses.map(
                  (depositInfo: DepositInfo, index: number) => (
                    <div className="flex flex-col" key={index}>
                      <p className="font-bold">DD Acc #{index + 1}</p>
                      {depositInfo.deposited && !depositInfo.submittedProof && (
                        <button
                          className={`bg-pink-400 hover:bg-pink-700 text-white font-bold py-2 px-4 rounded transition-colors disabled:opacity-50 disabled:hover:bg-pink-400`}
                          onClick={() => proveDeposit(index)}
                          disabled={depositInfo.proofInProgress}
                        >
                          <div className="flex inline-flex items-center">
                            {depositInfo.proofInProgress && (
                              <FaSpinner className="animate-spin text-gray-500 mr-2" />
                            )}{" "}
                            Prove deposit
                          </div>
                        </button>
                      )}
                      {depositInfo.submittedProof && !depositInfo.mintAuth && (
                        <button
                          className={`bg-pink-400 hover:bg-pink-700 text-white font-bold py-2 px-4 rounded transition-colors disabled:opacity-50 disabled:hover:bg-pink-400`}
                          onClick={() => mintAuth(index)}
                        >
                          <div className="flex inline-flex items-center">
                            Get DD token mint auth
                          </div>
                        </button>
                      )}
                    </div>
                  ),
                )}
              </div>
            </div>
          )}

          <div className="flex flex-row items-end grow">
            <div className="flex flex-col">
              <p className="font-bold">Your account</p>
              <Balance
                provider={providers.oasisProvider}
                address={providers.oasisWallet.address}
                symbol="ROSE"
              />
            </div>
          </div>
        </div>
      </div>
      {error !== null && <div className="text-red">{error}</div>}
    </div>
  );
}

export default App;
