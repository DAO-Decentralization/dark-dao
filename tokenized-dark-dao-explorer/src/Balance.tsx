import React from "react";
import { ethers } from "ethers";
import { useBalance } from "./hooks";

interface BalanceProps {
  provider: ethers.providers.Provider;
  address: string;
}

const Balance: React.FC<BalanceProps> = ({ provider, address }) => {
  const balance = useBalance(provider, address);
  return (
    <p>
      Balance:{" "}
      {balance ? balance.slice(0, Math.max(10, balance.indexOf(".") + 3)) : ""}{" "}
      ETH
    </p>
  );
};

export default Balance;
