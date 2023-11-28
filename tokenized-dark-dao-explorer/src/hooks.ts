import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { erc20Interface } from "./abis";

export function usedTimedFetcher<T>(
  fetcher: () => Promise<T>,
  defaultValue: T,
  interval: number = 5000,
): T {
  const [val, setVal] = useState<T>(defaultValue);
  useEffect(() => {
    let timer: NodeJS.Timer;

    const runFetch = async (): Promise<void> => {
      try {
        setVal(await fetcher());
      } catch (error) {
        console.error("Failed to fetch:", error);
      }
    };

    runFetch();

    timer = setInterval(runFetch, interval);

    return (): void => clearInterval(timer);
  }, [fetcher]);
  return val;
}

export const useBalance = (
  provider: ethers.providers.Provider,
  address: string,
  interval: number = 5000,
): string | null => {
  return usedTimedFetcher(
    async function (): Promise<string> {
      const balance = await provider.getBalance(address);
      return ethers.utils.formatEther(balance);
    },
    "",
    interval,
  );
};

export const useErc20Balance = (
  provider: ethers.providers.Provider,
  tokenAddress: string,
  holderAddress: string,
  interval: number = 5000,
): string | null => {
  return usedTimedFetcher(
    async function (): Promise<string> {
      const tokenContract = new ethers.Contract(
        tokenAddress,
        erc20Interface,
        provider,
      );
      const balance = await tokenContract.balanceOf(holderAddress);
      return ethers.utils.formatEther(balance);
    },
    "0",
    interval,
  );
};
