import { createContext } from "react";
import { JsonRpcProvider } from "@ethersproject/providers";
import { Wallet } from "ethers";

interface ProviderContextProps {
  ethProvider: JsonRpcProvider;
  oasisProvider: JsonRpcProvider;
  ethWallet: Wallet;
  oasisWallet: Wallet;
  ddTokenAddress?: string;
  ddAddress?: string;
}

const ProviderContext = createContext<ProviderContextProps>({
  ethProvider: new JsonRpcProvider("http://localhost:23545"),
  oasisProvider: new JsonRpcProvider("http://localhost:8545"),
  ethWallet: new Wallet(
    "0xab5fe78f1b6b48f36884673187896fc7e472f1ed573720a6513198054133f739",
  ),
  oasisWallet: new Wallet(
    "0x519028d411cec86054c9c35903928eed740063336594f1b3b076fce119238f6a",
  ),
});

export default ProviderContext;
