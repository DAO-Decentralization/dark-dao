import { useState } from "react";
import "./App.css";
import { ethers, JsonRpcApiProvider } from "ethers";
import TokenColumn from "./TokenColumn";

function App() {
  const [height, setHeight] = useState<number>(30);
  //const [deployed, setDeployed] = useState<boolean>(false);
  const [provider, setProvider] = useState<JsonRpcApiProvider | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function connectWallet() {
    if (provider === null) {
      try {
        if (window.ethereum === undefined) {
          throw new Error("Could not detect a browser provider");
        }
        const newProvider = new ethers.BrowserProvider(window.ethereum);
        setError(await newProvider.listAccounts().toString());
        setProvider(provider);
      } catch (e: any) {
        setError(e.toString());
      }
    }
  }

  return (
    <>
      <button onClick={() => setHeight(height + 10)}>Increase height</button>
      <h1 className="text-3xl font-semibold mb-2">
        Tokenized Dark DAO "Lite" Explorer
      </h1>
      <div className="flex">
        <div className="bg-blue-500 w-3/5">
          Ethereum
          <div className="flex flex-row items-end">
            <TokenColumn height={height} tokenImage="dd-token.svg" />
            <TokenColumn height={height / 2} tokenImage="dd-token.svg" />
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
        <div className="bg-pink-500 w-3/5">Oasis</div>
      </div>
      {error !== null && <div className="text-red">{error}</div>}
    </>
  );
}

export default App;
