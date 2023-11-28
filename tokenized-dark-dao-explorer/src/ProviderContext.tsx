import { createContext } from "react";
import { JsonRpcApiProvider, JsonRpcProvider } from "ethers";

interface ProviderContextProps {
  ethProvider: JsonRpcApiProvider;
  oasisProvider: JsonRpcApiProvider;
  ddTokenAddress?: string;
  ddAddress?: string;
}

const ProviderContext = createContext<ProviderContextProps>({
  ethProvider: new JsonRpcProvider("http://localhost:23545"),
  oasisProvider: new JsonRpcProvider("http://localhost:8545"),
});

export default ProviderContext;
