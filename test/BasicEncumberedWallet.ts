import {time, loadFixture} from '@nomicfoundation/hardhat-network-helpers';
import {anyValue} from '@nomicfoundation/hardhat-chai-matchers/withArgs';
import {expect} from 'chai';
import {ethers} from 'hardhat';
import * as sapphire from '@oasisprotocol/sapphire-paratime';
import {createEthereumMessage} from '../scripts/ethereum-signatures';

function getCurrentTime() {
	return Math.floor(Date.now() / 1000);
}

describe('BasicEncumberedWallet', () => {
	async function deployWallet() {
		// Contracts are deployed using the first signer/account by default
		const owner = sapphire.wrap(await ethers.getSigner());

		const EIP712Utils = await ethers.getContractFactory('EIP712Utils');
		const eip712Utils = await EIP712Utils.deploy();

		const BasicEncumberedWallet = await ethers.getContractFactory('BasicEncumberedWallet', {
			libraries: {
				EIP712Utils: eip712Utils.address,
			},
		});
		const wallet = await BasicEncumberedWallet.deploy();

		return {owner, wallet};
	}

	async function deployPolicy() {
		const walletArgs = await deployWallet();
		const ExampleEncumbrancePolicy = await ethers.getContractFactory('ExampleEncumbrancePolicy');
		const policy = await ExampleEncumbrancePolicy.deploy(walletArgs.wallet.address);

		return {...walletArgs, policy};
	}

	async function deployExampleDAOPolicy() {
		const walletArgs = await deployWallet();
		const OffchainDAOVoteVerifier = await ethers.getContractFactory('OffchainDAOVoteVerifier');
		const voteVerifier = await OffchainDAOVoteVerifier.deploy();
		const OffchainDAOBribingPolicy = await ethers.getContractFactory('OffchainDAOBribingPolicy');
		const votePolicy = await OffchainDAOBribingPolicy.deploy(walletArgs.wallet.address, voteVerifier.address);

		return {...walletArgs, voteVerifier, votePolicy};
	}

	describe('Wallet', () => {
		it('Should create a new wallet', async () => {
			const {owner, wallet} = await deployWallet();
			await wallet.createWallet(0).then(async w => w.wait());
			console.log(await wallet.getPublicKey(0));
		});
		it('Should not overwrite an existing wallet', async () => {
			const {owner, wallet} = await deployWallet();
			const createWalletTx = await wallet.createWallet(0);
			const gasUsed1 = (await createWalletTx.wait()).gasUsed;
			expect(gasUsed1.gt(100_000)).to.be.true;

			const publicKey = await wallet.getPublicKey(0);

			// Should fail to make a second wallet at the same index
			await expect(wallet.createWallet(0)).to.be.reverted;

			const publicKey2 = await wallet.getPublicKey(0);
			expect(publicKey).to.equal(publicKey2);
		});
		it('Should sign messages that are not encumbered', async () => {
			const {owner, wallet} = await deployWallet();
			await wallet.createWallet(0);
			const response = await wallet.signMessage(0, ethers.utils.toUtf8Bytes('Raw hello'));
			console.log('Signature:', response);
			const response2 = await wallet.signMessage(0, createEthereumMessage('Hello world'));
			console.log('Signature2:', response2);
		});
		it('Should enroll in an encumbrance contract, with working encumbrance', async () => {
			const {owner, wallet, policy} = await deployPolicy();
			await wallet.createWallet(0).then(async c => c.wait());
			await wallet.enterEncumbranceContract(0, policy.address, getCurrentTime() + (60 * 60), '0x').then(async c => c.wait());

			// Message is encumbered
			await expect(wallet.messageAllowed(owner.address, 0, '0x1919')).to.eventually.be.false;

			// Message is not encumbered
			await expect(wallet.messageAllowed(owner.address, 0, ethers.utils.toUtf8Bytes('Some other message'))).to.eventually.be.true;

			const sig = await wallet.signMessage(0, ethers.utils.toUtf8Bytes('Some other message'));
			console.log('Non-encumbered message signature:', sig);

			const encMessage = createEthereumMessage('Encumbered message');
			const sig2 = await policy.signOnBehalf(owner.address, 0, encMessage);
			console.log('Encumbered message and signature:', '"' + encMessage + '"', sig2);
		});
		it('Should do basic voting encumbrance', async () => {
			const {owner, wallet, votePolicy} = await deployExampleDAOPolicy();
			console.log('Creating wallet...');
			await wallet.createWallet(0).then(async c => c.wait());
			console.log('Entering encumbrance contract...');
			await wallet.enterEncumbranceContract(0, votePolicy.address, getCurrentTime() + (60 * 60), '0x').then(async c => c.wait());
			console.log('Done');

			const message = '0x4f6666636861696e44414f20566f74650000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000';

			// Message is encumbered
			await expect(wallet.messageAllowed(owner.address, 0, message)).to.eventually.be.false;
			// Message not encumbered (wrong length, wrong magic string)
			await expect(wallet.messageAllowed(owner.address, 0, ethers.utils.hexDataSlice(message, 1))).to.eventually.be.true;
			await expect(wallet.messageAllowed(owner.address, 0, ethers.utils.hexConcat(['0x4e', ethers.utils.hexDataSlice(message, 1)]))).to.eventually.be.true;
		});
	});
});
