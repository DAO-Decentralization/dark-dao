import { useState, useContext } from "react";
import { ethers } from "ethers";
import { TransactionReceipt } from "@ethersproject/providers";
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

interface DepositInfo {
  depositAddress: string;
  wrappedAddressInfo: string;
  deposited: boolean;
  depositInProgress: boolean;
  receipt?: TransactionReceipt;
}

function App() {
  const [tdd, setTdd] = useState<TokenizedDarkDAO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deployStatus, setDeployStatus] = useState<number>(0);
  const [depositAddresses, setDepositAddresses] = useState<DepositInfo[]>([]);

  const providers = useContext(ProviderContext);

  async function deploy() {
    try {
      const {
        tdd,
        daoToken: _daoToken,
        blockHeaderOracle: _blockHeaderOracle,
      } = await deployTdd(
        providers.ethWallet.connect(providers.ethProvider),
        providers.oasisWallet.connect(providers.oasisProvider),
        (status: number) => setDeployStatus(status),
      );
      setTdd(tdd);
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
        { ...depositInfo, deposited: false, depositInProgress: false },
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
      newDepositAddresses[index].deposited = true;
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
      newDepositAddresses[index].depositInProgress = false;
      newDepositAddresses[index].receipt = transferReceipt;
      setDepositAddresses(newDepositAddresses);
    } catch (error: any) {
      setError(error.toString());
    }
  }

  return (
    <div className="text-white">
      <h1 className="text-3xl font-semibold mb-4">
        Tokenized Dark DAO "Lite" Explorer
      </h1>
      <div className="flex" style={{ minHeight: "500px" }}>
        <div className="bg-blue-600 w-3/5 text-white flex flex-col p-2">
          <h2 className="text-xl font-semibold mb-2">Ethereum</h2>
          <div className="flex flex-row items-end grow space-x-2">
            <div className="flex flex-col items-center">
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
              depositAddresses.map((depositInfo: DepositInfo, index: number) =>
                depositInfo.deposited ? (
                  <div className="flex flex-col">
                    <div className="flex flex-row items-end">
                      <Erc20TokenColumn
                        provider={providers.ethProvider}
                        tokenAddress={tdd.targetDaoTokenAddress}
                        holderAddress={depositInfo.depositAddress}
                        tokenImage="dao-token.svg"
                        caption="DAO"
                      />
                    </div>
                    <p className="font-bold">DD Acc #{index + 1}</p>
                    <Balance
                      provider={providers.ethProvider}
                      address={depositInfo.depositAddress}
                    />
                  </div>
                ) : (
                  <></>
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
              <div className="flex flex-row flex-wrap">
                {depositAddresses.map(
                  (depositInfo: DepositInfo, index: number) => (
                    <div className="flex flex-col">
                      <p className="font-bold">DD Acc #{index + 1}</p>
                      <button
                        className={`bg-pink-400 hover:bg-pink-700 text-white font-bold py-2 px-4 rounded transition-colors disabled:opacity-50 disabled:hover:bg-pink-400`}
                        onClick={() => deposit(index)}
                        disabled={depositInfo.deposited}
                      >
                        <div className="flex inline-flex items-center">
                          {depositInfo.depositInProgress && (
                            <FaSpinner className="animate-spin text-gray-500 mr-2" />
                          )}{" "}
                          Deposit DAO tokens
                        </div>
                      </button>
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
