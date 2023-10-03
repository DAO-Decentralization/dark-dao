import {expect} from 'chai';
import {ethers} from 'hardhat';
import {derToEthSignature} from '../scripts/ethereum-signatures';

const oasisTestChainId = 0x5A_FD;
// Use a different network that supports a state proof for testing the public network
// Example: geth
const ethTestChainId = 30_121;

// The "public" network, i.e. Ethereum network
const publicProvider = new ethers.providers.JsonRpcProvider('http://localhost:23545');
// The storage slot of the balances mapping in our TestERC20 token is 0
const daoTokenBalanceMappingSlot = '0x00';

function getMappingStorageSlot(mappingKey: string, mappingSlot: string): string {
	return ethers.utils.keccak256(ethers.utils.hexConcat([ethers.utils.hexZeroPad(mappingKey, 32), ethers.utils.hexZeroPad(mappingSlot, 32)]));
}

describe('PrivateKeyGenerator', () => {
	async function deployPkTest() {
		const pkTestFactory = await ethers.getContractFactory('PrivateKeyGeneratorTest');
		const pkTest = await pkTestFactory.deploy();
		await pkTest.deployed();

		return {pkTest};
	}

	describe('Public key and public address', () => {
		it('Should decompress a public key', async () => {
			const {pkTest} = await deployPkTest();
			await expect(pkTest.decompressPublicKeyExternal('0x02fe0c28c123e475d8339f4912812aa278ffd28718d617d794ee599f6ec63fb3e7')).to.eventually.equal('0xfe0c28c123e475d8339f4912812aa278ffd28718d617d794ee599f6ec63fb3e759355af4624e5708c1e9e09502731de59790499d5c0138ac689eebfab6087274');
		});
		it('Should compute a public address', async () => {
			const {pkTest} = await deployPkTest();
			await expect(pkTest.ethAddressFromPublicKeyExternal('0xfe0c28c123e475d8339f4912812aa278ffd28718d617d794ee599f6ec63fb3e759355af4624e5708c1e9e09502731de59790499d5c0138ac689eebfab6087274')).to.eventually.equal('0x6e28b69193fcF10127de6c0f631BA421dB0B1fA7');
		});
	});
});

describe('Nonvoting Token', () => {
	async function deployToken() {
		// Contracts are deployed using the first signer/account by default
		const owner = await ethers.getSigner();
		const ownerPublic = (new ethers.Wallet('0x519028d411cec86054c9c35903928eed740063336594f1b3b076fce119238f6a')).connect(publicProvider);

		// On Ethereum
		const daoTokenFactory = await ethers.getContractFactory('TestERC20Token', ownerPublic);
		const daoToken = await daoTokenFactory.deploy();
		await daoToken.deployed();

		// On Oasis
		const blockHeaderOracleFactory = await ethers.getContractFactory('TrivialBlockHeaderOracle');
		const blockHeaderOracle = await blockHeaderOracleFactory.deploy();
		await blockHeaderOracle.deployed();
		const stateVerifierFactory = await ethers.getContractFactory('ProvethVerifier');
		const stateVerifier = await stateVerifierFactory.deploy();
		await stateVerifier.deployed();

		// On Oasis
		// Calculate the address of the nonvoting DAO token
		const nvDaoTokenPredictedAddress = ethers.utils.getContractAddress({
			from: owner.address,
			nonce: await publicProvider.getTransactionCount(owner.address) + (oasisTestChainId === ethTestChainId ? 1 : 0),
		});
		const darkDaoFactory = await ethers.getContractFactory('VoteSellingDarkDAO');
		const dd = await darkDaoFactory.deploy(
			blockHeaderOracle.address, stateVerifier.address, nvDaoTokenPredictedAddress, daoToken.address,
			daoTokenBalanceMappingSlot, ethers.BigNumber.from((10n ** 18n) * 8n));
		await dd.deployed();

		// On Ethereum
		const nvDaoTokenFactory = await ethers.getContractFactory('NonVotingDAOToken', ownerPublic);
		const nvDaoToken = await nvDaoTokenFactory.deploy(daoToken.address, await dd.darkDaoSignerAddress());
		await nvDaoToken.deployed();
		expect(nvDaoToken.address).to.equal(nvDaoTokenPredictedAddress);

		return {owner, ownerPublic, blockHeaderOracle, dd, daoToken, nvDaoToken};
	}

	describe('Token deployment', () => {
		it('Should deploy a nonvoting token', async () => {
			await deployToken();
		});
	});

	describe('Deposits', () => {
		it('Should generate a deposit address', async () => {
			const {dd, owner} = await deployToken();
			const result = await dd.generateDepositAddress(owner.address);
			console.log('Deposit address: ' + result.depositAddress);
		});
		it('Should calculate storage slots correctly', () => {
			expect(getMappingStorageSlot('0x60C2780B7412b9b28b724FBcD76a7e723468B664', '0x02')).to.equal('0x1b78f95ce9c545113830f6f7eec96f49712a408da3b4b03d72d06260f909dc15');
		});
		it('Should accept a valid deposit', async () => {
			const {dd, owner, blockHeaderOracle, daoToken, nvDaoToken, ownerPublic} = await deployToken();
			const nvDaoTokensRecipient = owner.address;
			const depositData = await dd.generateDepositAddress(nvDaoTokensRecipient);
			console.log('Deposit address: ' + depositData.depositAddress);

			// Transfer nvDAO tokens to deposit address
			const depositAmount = (10n ** 18n) * 100n;
			await daoToken.connect(ownerPublic).transfer(depositData.depositAddress, depositAmount).then(async t => t.wait());
			const proofBlock = await publicProvider.getBlock('latest');
			await blockHeaderOracle.setBlockHeaderHash(proofBlock.number, proofBlock.hash);

			const depositStorageSlot = getMappingStorageSlot(depositData.depositAddress, daoTokenBalanceMappingSlot);
			const proofBlockNumberRpcString = ethers.BigNumber.from(proofBlock.number).toHexString().replaceAll('0x0', '0x');
			const proof = await publicProvider.send('eth_getProof', [daoToken.address, [depositStorageSlot], proofBlockNumberRpcString]);
			expect(ethers.BigNumber.from(proof.storageProof[0].value).eq(depositAmount)).to.be.true;

			// Get the RLP-encoded block header for this block
			const rawProofBlockHeader = await publicProvider.send('debug_getRawHeader', [proofBlockNumberRpcString]);
			expect(ethers.utils.keccak256(rawProofBlockHeader)).to.equal(proofBlock.hash);

			// Submit a deposit proof
			console.log('Registering deposit...');
			const storageProof = {
				rlpBlockHeader: rawProofBlockHeader,
				addr: daoToken.address,
				storageSlot: depositStorageSlot,
				accountProofStack: ethers.utils.RLP.encode(proof.accountProof.map(rlpValue => ethers.utils.RLP.decode(rlpValue))),
				storageProofStack: ethers.utils.RLP.encode(proof.storageProof[0].proof.map(rlpValue => ethers.utils.RLP.decode(rlpValue))),
			};
			await dd.registerDeposit(depositData.wrappedAddressInfo, proofBlock.number, storageProof).then(async t => t.wait());
			const depositReceipt = await dd.deposits(0);
			console.log('Deposit receipt:', depositReceipt);

			// Mint the nvDAO tokens
			console.log(depositReceipt.signature);
			const depositMessage = ethers.utils.defaultAbiCoder.encode(['string', 'address', 'uint256', 'bytes32'], ['deposit', nvDaoTokensRecipient, depositAmount, depositReceipt.depositId]);
			const depositSignature = derToEthSignature(depositReceipt.signature, ethers.utils.keccak256(depositMessage), await dd.darkDaoSignerAddress(), false);
			await nvDaoToken.finalizeDeposit(nvDaoTokensRecipient, depositAmount, depositReceipt.depositId, depositSignature).then(async tx => tx.wait());
			const nvDaoTokenBal = await nvDaoToken.balanceOf(nvDaoTokensRecipient);
			expect(nvDaoTokenBal).to.equal(depositAmount);
		});
	});
});
