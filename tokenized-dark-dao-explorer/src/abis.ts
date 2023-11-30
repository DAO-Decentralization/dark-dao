import { ethers } from "ethers";

const erc20Abi = [
  "function balanceOf(address holder) public view returns (uint256 balance)",
  "function transfer(address to, uint256 value) public",
];

export const erc20Interface = new ethers.utils.Interface(erc20Abi);
