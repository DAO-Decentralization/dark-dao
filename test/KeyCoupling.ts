import {time, loadFixture} from '@nomicfoundation/hardhat-network-helpers';
import {anyValue} from '@nomicfoundation/hardhat-chai-matchers/withArgs';
import {expect} from 'chai';
import {ethers} from 'hardhat';
import * as sapphire from '@oasisprotocol/sapphire-paratime';

describe('KeyCoupling', () => {
	async function deployKeyCoupling() {
		// Contracts are deployed using the first signer/account by default
		const owner = sapphire.wrap(await ethers.getSigner());

		const KeyCoupling = await ethers.getContractFactory('KeyCoupling');
		const keyCoupling = await KeyCoupling.deploy();
		const publicKey = await keyCoupling.getPublicKey();
		const publicAddress = await keyCoupling.getPublicAddress();
		console.log('Public address: ' + publicAddress);
		return {owner, keyCoupling, publicKey};
	}

	describe('Deployment', () => {
		it('Should get the public key', async () => {
			const {owner, keyCoupling, publicKey} = await deployKeyCoupling();
			console.log(publicKey);
		});
	});
});
