import {expect} from 'chai';
import {ethers} from 'hardhat';

describe('Nonvoting Token', () => {
	async function deployToken() {
		// Contracts are deployed using the first signer/account by default
		const owner = await ethers.getSigner();

		// On Ethereum
		const daoTokenFactory = await ethers.getContractFactory('TestERC20Token');
		const daoToken = await daoTokenFactory.deploy();
		await daoToken.deployed();

		// On Oasis
		const blockHeaderOracleFactory = await ethers.getContractFactory('TrivialBlockHeaderOracle');
		const blockHeaderOracle = await blockHeaderOracleFactory.deploy();
		await blockHeaderOracle.deployed();

		// On Oasis
		const darkDaoFactory = await ethers.getContractFactory('VoteSellingDarkDAO');
		const dd = await darkDaoFactory.deploy(blockHeaderOracle.address);
		await dd.deployed();

		// On Ethereum
		const nvDaoTokenFactory = await ethers.getContractFactory('NonVotingDAOToken');
		const nvDaoToken = await nvDaoTokenFactory.deploy(daoToken.address, dd.address);
		await nvDaoToken.deployed();

		return {owner, blockHeaderOracle, dd, nvDaoToken};
	}

	describe('Token deployment', () => {
		it('Should deploy a nonvoting token', async () => {
			await deployToken();
		});
	});

	describe('Deposits', () => {
		it('Should generate a deposit address', async () => {
			const {dd} = await deployToken();
			const result = await dd['generateDepositAddress()']();
			console.log('Deposit address: ' + result.depositAddress);
		});
	});
});
