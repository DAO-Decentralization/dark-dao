import React from "react";
import { ethers } from "ethers";
import { useBalance } from "./hooks";

interface BalanceProps {
  provider: ethers.providers.Provider;
  address: string;
  symbol?: string;
}

const Balance: React.FC<BalanceProps> = ({
  provider,
  address,
  symbol = "ETH",
}) => {
  const balance = useBalance(provider, address);
  return (
    <>
      {balance ? balance.slice(0, Math.max(10, balance.indexOf(".") + 3)) : ""}{" "}
      {symbol}
    </>
  );
};

export default Balance;
