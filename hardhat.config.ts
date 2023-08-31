import {type HardhatUserConfig} from 'hardhat/config';
import '@oasisprotocol/sapphire-hardhat';
import '@nomicfoundation/hardhat-toolbox';

const config: HardhatUserConfig = {
	solidity: '0.8.18',
	networks: {
		sapphire_testnet: {
			url: 'https://testnet.sapphire.oasis.dev',
			accounts: process.env.PRIVATE_KEY
				? [process.env.PRIVATE_KEY]
				: [],
			chainId: 0x5A_FF,
		},
		dev: {
			url: 'http://127.0.0.1:8545',
			// 0x72A6CF1837105827077250171974056B40377488
			accounts: ['0x519028d411cec86054c9c35903928eed740063336594f1b3b076fce119238f6a'],
			chainId: 0x5A_FD,
			timeout: 10_000_000,
			timeoutBlocks: 10_000_000,
		},
	},
	mocha: {
		timeout: 10_000_000,
	},
};

export default config;
