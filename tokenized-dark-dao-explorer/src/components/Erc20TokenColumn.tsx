import TokenColumn from "./TokenColumn";
import React from "react";
import { ethers } from "ethers";
import { useErc20Balance } from "../hooks";

interface Erc20TokenColumnProps {
  provider: ethers.providers.Provider;
  tokenAddress: string;
  holderAddress: string;
  tokenImage: string;
  caption: string;
}

const Erc20TokenColumn: React.FC<Erc20TokenColumnProps> = ({
  provider,
  tokenAddress,
  holderAddress,
  tokenImage,
  caption,
}) => {
  const balance = useErc20Balance(provider, tokenAddress, holderAddress);
  return (
    <TokenColumn
      height={Number(balance)}
      tokenImage={tokenImage}
      caption={caption}
    />
  );
};

export default Erc20TokenColumn;
