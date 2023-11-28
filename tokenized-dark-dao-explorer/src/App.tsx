import { useState, useContext } from "react";
import "./App.css";
import { ethers } from "ethers";
import TokenColumn from "./TokenColumn";
import { TokenizedDarkDAO } from "../../scripts/tokenized-dark-dao";
import ProviderContext from "./ProviderContext";

function App() {
  const [height, setHeight] = useState<number>(30);
  //const [deployed, setDeployed] = useState<boolean>(false);
  const [_, setTdd] = useState<TokenizedDarkDAO | null>(null);
  const [error, setError] = useState<string | null>(null);

  const providers = useContext(ProviderContext);

  async function connectWallet() {
    try {
      if (window.ethereum === undefined) {
        throw new Error("Could not detect a browser provider");
      }
      const newProvider = new ethers.BrowserProvider(window.ethereum);
      setError(await newProvider.listAccounts().toString());
    } catch (e: any) {
      setError(e.toString());
    }

    await test();
  }

  async function test() {
    if (
      providers.ethProvider &&
      providers.oasisProvider &&
      providers.ddTokenAddress &&
      providers.ddAddress
    ) {
      setTdd(
        await TokenizedDarkDAO.create(
          new ethers.Contract(providers.ddAddress, [], providers.oasisProvider),
          new ethers.Contract(
            providers.ddTokenAddress,
            [],
            providers.ethProvider,
          ),
          "0x00",
          "0x00",
        ),
      );
    }
  }

  return (
    <div className="text-white">
      <button onClick={() => setHeight(height + 10)}>Increase height</button>
      <h1 className="text-3xl font-semibold mb-2">
        Tokenized Dark DAO "Lite" Explorer
      </h1>
      <div className="flex">
        <div className="bg-blue-600 w-3/5 text-white">
          Ethereum
          <div className="flex flex-row items-end">
            <div className="flex flex-col">
              <div className="flex flex-row items-end">
                <TokenColumn
                  height={height}
                  tokenImage="dd-token2.svg"
                  caption="DD"
                />
                <TokenColumn
                  height={height / 2}
                  tokenImage="dao-token.svg"
                  caption="DAO"
                />
              </div>
              <p>Your tokens</p>
            </div>
          </div>
        </div>
        <div className="bg-gray-400 w-2/5">
          <button
            className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
            onClick={connectWallet}
          >
            Connect Wallet
          </button>
        </div>
        <div className="bg-pink-600 w-3/5">Oasis</div>
      </div>
      {error !== null && <div className="text-red">{error}</div>}
    </div>
  );
}

export default App;
