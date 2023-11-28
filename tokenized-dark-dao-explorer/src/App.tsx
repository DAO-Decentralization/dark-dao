import { useState, useContext } from "react";
import "./App.css";

import Erc20TokenColumn from "./components/Erc20TokenColumn";
import { TokenizedDarkDAO } from "../../scripts/tokenized-dark-dao";
import ProviderContext from "./ProviderContext";
import { deployTdd } from "./deploy-tdd.ts";
import Balance from "./Balance";
import ChecklistItem from "./components/ChecklistItem";
import "./PulsingButton.css";

function App() {
  const [tdd, setTdd] = useState<TokenizedDarkDAO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deployStatus, setDeployStatus] = useState<number>(0);

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

  return (
    <div className="text-white">
      <h1 className="text-3xl font-semibold mb-2">
        Tokenized Dark DAO "Lite" Explorer
      </h1>
      <div className="flex" style={{ height: "750px" }}>
        <div className="bg-blue-600 w-3/5 text-white flex flex-col p-2">
          <h2 className="text-xl font-semibold mb-2">Ethereum</h2>
          <div className="flex flex-row items-end grow">
            <div className="flex flex-col">
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
              <Balance
                provider={providers.ethProvider}
                address={providers.ethWallet.address}
              />
              <p>Your account</p>
            </div>
          </div>
        </div>
        <div className="bg-gray-400 w-2/5 p-2">
          <button
            className={`bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded ${
              deployStatus === 0 ? "pulsing-button" : ""
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
        <div className="bg-pink-600 w-3/5 p-2">
          <h2 className="text-xl font-semibold mb-2">Oasis</h2>
        </div>
      </div>
      {error !== null && <div className="text-red">{error}</div>}
    </div>
  );
}

export default App;
