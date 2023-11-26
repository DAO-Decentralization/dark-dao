import { BrowserProvider, Eip1193Provider } from "ethers/types/providers";
declare global {
  interface Window {
    ethereum: BrowserProvider & Eip1193Provider;
  }
}
