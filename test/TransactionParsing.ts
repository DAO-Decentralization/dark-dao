import {time, loadFixture} from '@nomicfoundation/hardhat-network-helpers';
import {anyValue} from '@nomicfoundation/hardhat-chai-matchers/withArgs';
import {expect} from 'chai';
import {ethers} from 'hardhat';

describe('TransactionParsing', () => {
	async function deployTransactionParsing() {
		const TransactionParsing = await ethers.getContractFactory('TransactionReader');
		const tp = await TransactionParsing.deploy();
		return {tp};
	}

	it('Should parse a basic type-2 transaction', async () => {
		const {tp} = await deployTransactionParsing();
		// Private key is 0x01
		const signedTx = '0x02f8790180843b9aca008502540be400825208941234567890abcdef1234567890abcdef12345678880de0b6b3a764000086010203040506c001a01adf25d3266ed0a571234f3084bf2f84ed7c1a50b63aca5dbe8b389929186fe8a007841a404663381d87a838fd2442b4c73bb1a5d334e5147e6a2165e8f89f95f8';
		const unsignedTx = '0x02f60180843b9aca008502540be400825208941234567890abcdef1234567890abcdef12345678880de0b6b3a764000086010203040506c0';
		const result = await tp.parseTransaction(unsignedTx);
		expect(result.chainId).to.equal(1);
		expect(result.nonce).to.equal(0);
		expect(result.maxPriorityFeePerGas).to.equal(ethers.BigNumber.from(0x3B_9A_CA_00));
		expect(result.maxFeePerGas).to.equal(ethers.BigNumber.from(0x02_54_0B_E4_00));
		expect(result.gasLimit).to.equal(ethers.BigNumber.from(0x52_08));
		expect(result.destination).to.equal('0x1234567890AbcdEF1234567890aBcdef12345678'.toLowerCase());
		expect(result.amount).to.equal(ethers.BigNumber.from('0x0de0b6b3a7640000'));
		expect(result.payload).to.equal('0x010203040506');
	});
});
