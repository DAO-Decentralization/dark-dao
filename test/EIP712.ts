import {time, loadFixture} from '@nomicfoundation/hardhat-network-helpers';
import {anyValue} from '@nomicfoundation/hardhat-chai-matchers/withArgs';
import {expect} from 'chai';
import {ethers} from 'hardhat';
import * as sapphire from '@oasisprotocol/sapphire-paratime';
import {_TypedDataEncoder as TypedDataEncoder} from '@ethersproject/hash';

describe('EIP-712 Utils', () => {
	async function deployEIP712Parameters() {
		// Contracts are deployed using the first signer/account by default
		const owner = await ethers.getSigner();// Sapphire.wrap(await ethers.getSigner());

		const EIP712Utils = await ethers.getContractFactory('EIP712Utils');
		const eip712Utils = await EIP712Utils.deploy();

		const EIP712UtilsTest = await ethers.getContractFactory('EIP712UtilsTest', {
			libraries: {
				EIP712Utils: eip712Utils.address,
			},
		});
		const utils = await EIP712UtilsTest.deploy();
		await utils.deployed();
		return {owner, utils};
	}

	describe('Deployment', () => {
		it('Should calculate the correct domain hash', async () => {
			const {owner, utils} = await deployEIP712Parameters();
			const domain = {name: 'testdomain', version: '0.1.0', chainId: 1, verifyingContract: '0x0000000000000000000000000000000000000000'};
			await expect(utils.buildDomainSeparator(domain)).to.eventually.equal(TypedDataEncoder.hashDomain(domain));
		});
		it('Should calculate the correct struct and type hash', async () => {
			const {owner, utils} = await deployEIP712Parameters();
			const typeString = 'Mail(Person from,Person to,string contents)Person(string name,address wallet)';
			const personTypehash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('Person(string name,address wallet)'));
			const encodedData = ethers.utils.hexConcat([
				ethers.utils.keccak256(ethers.utils.hexConcat([
					personTypehash,
					ethers.utils.keccak256(ethers.utils.toUtf8Bytes('Cow')),
					'0x000000000000000000000000CD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826',
				])),
				ethers.utils.keccak256(ethers.utils.hexConcat([
					personTypehash,
					ethers.utils.keccak256(ethers.utils.toUtf8Bytes('Bob')),
					'0x000000000000000000000000bBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB',
				])),
				ethers.utils.keccak256(ethers.utils.toUtf8Bytes('Hello, Bob!')),
			]);

			const structHash = await utils.hashStruct(typeString, encodedData);
			expect(structHash).to.equal('0xc52c0ee5d84264471806290a3f2c4cecfc5490626bf912d01f240d7a274b371e');

			const typedDataHash = await utils.getTypedDataHash({
				name: 'Ether Mail',
				version: '1',
				chainId: 1,
				verifyingContract: '0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC',
			}, typeString, encodedData);
			expect(ethers.utils.recoverAddress(typedDataHash, {
				r: '0x4355c47d63924e8a72e509b65029052eb6c299d53a04e167c5775fd466751c9d',
				s: '0x07299936d304c153f6443dfa05f40ff007d72911b6f72307f996231605b91562',
				v: 28,
			})).to.equal('0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826');
		});
	});
});
