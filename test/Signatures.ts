import {time, loadFixture} from '@nomicfoundation/hardhat-network-helpers';
import {anyValue} from '@nomicfoundation/hardhat-chai-matchers/withArgs';
import {expect} from 'chai';
import {ethers} from 'hardhat';
import * as sapphire from '@oasisprotocol/sapphire-paratime';
import {createEthereumMessage, derToEthSignature} from '../scripts/ethereum-signatures';

describe('Signatures', () => {
	async function deploySignatures() {
		// Contracts are deployed using the first signer/account by default
		const owner = sapphire.wrap(await ethers.getSigner());

		const Signatures = await ethers.getContractFactory('Signatures1');
		const signatures = await Signatures.deploy();

		return {owner, signatures};
	}

	describe('Deployment', () => {
		it('Should get the public key and private key', async () => {
			const {owner, signatures} = await deploySignatures();

			const [pubKey, privKey] = await signatures.showKeys();
			console.log(pubKey, privKey);
		});
		it('Should sign a message', async () => {
			const {owner, signatures} = await deploySignatures();

			const [pubKey, privKey] = await signatures.showKeys();
			console.log('Pub', pubKey, 'Priv', privKey);
			const message = 'signed message';
			const messageEthBytes = createEthereumMessage(message);

			const signature = await signatures.signMessage(messageEthBytes);
			const wallet = new ethers.Wallet(privKey);
			const expectedSignature = await wallet.signMessage(message);
			console.log('Expected sig:\n' + expectedSignature);

			console.log('Raw Oasis DER-encoded signature:', signature);
			console.log('DER-encoded signature length:', ethers.utils.hexDataLength(signature));

			const ethSig = derToEthSignature(signature, message, ethers.utils.computeAddress(pubKey), true);

			expect(ethSig).to.be.not.null;

			console.log(ethers.utils.splitSignature(ethSig));
			console.log('Recovered signer address:', ethers.utils.verifyMessage(message, ethSig));
			expect(ethSig).to.equal(expectedSignature);
		});
	});
});
