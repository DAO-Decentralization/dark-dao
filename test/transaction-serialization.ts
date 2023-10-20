import {time, loadFixture} from '@nomicfoundation/hardhat-network-helpers';
import {anyValue} from '@nomicfoundation/hardhat-chai-matchers/withArgs';
import {expect} from 'chai';
import {ethers} from 'hardhat';

describe('TransactionParsing', () => {
	async function deployTransactionReader() {
		const TransactionReader = await ethers.getContractFactory('TransactionReader');
		const tr = await TransactionReader.deploy();
		return {tr};
	}

	it('Should parse a basic type-2 transaction', async () => {
		const {tr} = await deployTransactionReader();
		// Private key is 0x01
		const signedTx = '0x02f8790180843b9aca008502540be400825208941234567890abcdef1234567890abcdef12345678880de0b6b3a764000086010203040506c001a01adf25d3266ed0a571234f3084bf2f84ed7c1a50b63aca5dbe8b389929186fe8a007841a404663381d87a838fd2442b4c73bb1a5d334e5147e6a2165e8f89f95f8';
		const unsignedTx = '0x02f60180843b9aca008502540be400825208941234567890abcdef1234567890abcdef12345678880de0b6b3a764000086010203040506c0';
		const result = await tr.parseTransaction(unsignedTx);
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

describe('TransactionSerializer', () => {
	async function deployTxSerializer() {
		const transactionSerializerLibrary = await ethers.getContractFactory('TransactionSerializer');
		const tsl = await transactionSerializerLibrary.deploy();
		const TransactionSerializerTest = await ethers.getContractFactory('TransactionSerializerTest', {
			libraries: {
				TransactionSerializer: tsl.address,
			},
		});
		const ts = await TransactionSerializerTest.deploy();
		return {ts};
	}

	it('Should serialize a basic type-2 transaction', async () => {
		const {ts} = await deployTxSerializer();
		const tx = {
			chainId: 1,
			nonce: 0,
			maxPriorityFeePerGas: 0x3B_9A_CA_00,
			maxFeePerGas: 0x02_54_0B_E4_00,
			gasLimit: 0x52_08,
			destination: '0x1234567890AbcdEF1234567890aBcdef12345678',
			amount: '0x0de0b6b3a7640000',
			payload: '0x010203040506',
		};
		const serializedUnsignedTx = await ts.serializeTransaction(tx);
		expect(serializedUnsignedTx).to.equal('0x02f60180843b9aca008502540be400825208941234567890abcdef1234567890abcdef12345678880de0b6b3a764000086010203040506c0');
	});

	it('Should serialize a type-2 transaction whose destination address has leading zero bytes', async () => {
		const {ts} = await deployTxSerializer();
		const tx = {
			chainId: 1,
			nonce: 0,
			maxPriorityFeePerGas: 0,
			maxFeePerGas: 0,
			gasLimit: 25_000,
			destination: '0x000037dbacB1B1164F0a03374CEf4A4A6D1B56D8',
			amount: '0',
			payload: '0x',
		};
		const serializedUnsignedTx = await ts.serializeTransaction(tx);
		expect(serializedUnsignedTx).to.equal('0x02df018080808261a894000037dbacb1b1164f0a03374cef4a4a6d1b56d88080c0');
	});

	it('Should serialize a signed type-2 transaction', async () => {
		const {ts} = await deployTxSerializer();
		const tx = {
			chainId: 1,
			nonce: 0,
			maxPriorityFeePerGas: 2_000_000_000,
			maxFeePerGas: 25_000_000_000,
			gasLimit: 22_000,
			destination: '0x0102030405060708091011121314151617181920',
			amount: 0,
			payload: '0xde',
		};
		const signedTx = {
			transaction: tx,
			r: '0x56c621b4ff1c59a99a2ae5cd7575e9f7f3de7fefdefb48f54c61d11b4d4ae61b',
			s: '0x53ae4db88e3fec34fc0c24d7119a10173f5dde5170520960d7aeae48d42396f7',
			v: 0,
		};
		const serializedSignedTx = await ts.serializeSignedTransaction(signedTx);
		expect(serializedSignedTx).to.equal('0x02f86c018084773594008505d21dba008255f09401020304050607080910111213141516171819208081dec080a056c621b4ff1c59a99a2ae5cd7575e9f7f3de7fefdefb48f54c61d11b4d4ae61ba053ae4db88e3fec34fc0c24d7119a10173f5dde5170520960d7aeae48d42396f7');
	});

	it('Should serialize a signed type-2 transaction with a small r value', async () => {
		const {ts} = await deployTxSerializer();
		const tx = {
			chainId: 1,
			nonce: 0,
			maxPriorityFeePerGas: 2_000_000_000,
			maxFeePerGas: 25_000_000_000,
			gasLimit: 22_000,
			destination: '0x0102030405060708091011121314151617181920',
			amount: 0,
			payload: '0xde',
		};
		const signedTx = {
			transaction: tx,
			r: '0x56c621b4ff1c59a99a2ae5cd7575e9f7f3de7fefdefb48f54c61d11b4d4ae61b',
			s: '0x53ae4db88e3fec34fc0c24d7119a10173f5dde5170520960d7aeae48d42396f7',
			v: 0,
		};
		const serializedSignedTx = await ts.serializeSignedTransaction(signedTx);
		expect(serializedSignedTx).to.equal('0x02f86c018084773594008505d21dba008255f09401020304050607080910111213141516171819208081dec080a056c621b4ff1c59a99a2ae5cd7575e9f7f3de7fefdefb48f54c61d11b4d4ae61ba053ae4db88e3fec34fc0c24d7119a10173f5dde5170520960d7aeae48d42396f7');
	});

	it('Should serialize a signed type-2 transaction 2', async () => {
		const {ts} = await deployTxSerializer();
		const tx = {
			chainId: 30_121,
			nonce: 0,
			maxPriorityFeePerGas: 1_000_000_000,
			maxFeePerGas: 1_000_000_000_000,
			gasLimit: 100_000,
			destination: '0xeF47d3A70814be32817979CC9D7F00E4f9FfF0C8',
			amount: 0,
			payload: '0xa9059cbb000000000000000000000000c42a84d4f2f511f90563dc984311ab737ee56efd000000000000000000000000000000000000000000000002b5e3af16b1880000',
		};
		const signedTx = {
			transaction: tx,
			r: '0x140cc3e71a25c2ac096f1761654aa0db02e48a4bdb2d5035e89be8b1b7f54d07',
			s: '0x6cb307c4351f9ce5b3403dd8a3141e7a0b47603dd7bf5ff03944666f32db4240',
			v: 1,
		};
		const serializedSignedTx = await ts.serializeSignedTransaction(signedTx);
		expect(serializedSignedTx).to.equal('0x02f8b38275a980843b9aca0085e8d4a51000830186a094ef47d3a70814be32817979cc9d7f00e4f9fff0c880b844a9059cbb000000000000000000000000c42a84d4f2f511f90563dc984311ab737ee56efd000000000000000000000000000000000000000000000002b5e3af16b1880000c001a0140cc3e71a25c2ac096f1761654aa0db02e48a4bdb2d5035e89be8b1b7f54d07a06cb307c4351f9ce5b3403dd8a3141e7a0b47603dd7bf5ff03944666f32db4240');
	});
});
