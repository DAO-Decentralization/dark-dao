import {expect} from 'chai';
import {ethers} from 'hardhat';
import {Trie} from '@ethereumjs/trie';
import {type TransactionResponse} from '@ethersproject/abstract-provider';
import {derToEthSignature} from '../scripts/ethereum-signatures';
import {type PopulatedTypedData, getTypedDataParams} from '../scripts/eip712-builder';
import {TokenizedDarkDAO, getMappingStorageSlot, getRpcUint, getRlpUint} from '../scripts/tokenized-dark-dao';

const oasisTestChainId = 0x5A_FD;
// Use a different network that supports a state proof for testing the public network
// Example: geth
const ethTestChainId = 30_121;

// The "public" network, i.e. Ethereum network
const publicProvider = new ethers.providers.JsonRpcProvider('http://localhost:23545');
// The storage slot of the balances mapping in our TestERC20 token is 0
const daoTokenBalanceMappingSlot = '0x00';
// The withdrawals slot in the DD token contract is 12
const ddTokenWithdrawalsSlot = 12;

// If true, prints the gas usage of operations and Dark DAO contract bytecode size
const verboseContractExecution = true;

function showTransactionResult(title: string, transactionReceipt: TransactionResponse) {
	if (verboseContractExecution) {
		console.log(title, 'gas usage:', transactionReceipt.gasUsed.toString());
	}
}

function getSnapshotVoteTypedData(address: string, proposal: string): PopulatedTypedData {
	const typedData = {
		types: {
			Vote: [
				{name: 'from', type: 'address'},
				{name: 'space', type: 'string'},
				{name: 'timestamp', type: 'uint64'},
				{name: 'proposal', type: 'bytes32'},
				{name: 'choice', type: 'uint32'},
				{name: 'reason', type: 'string'},
				{name: 'app', type: 'string'},
				{name: 'metadata', type: 'string'},
			],
		},
		domain: {
			name: 'snapshot',
			version: '0.1.4',
		},
		primaryType: 'Vote',
		message: {
			from: address,
			space: 'bnb50000.eth',
			timestamp: '1694651892',
			proposal,
			choice: '1',
			reason: '',
			app: 'snapshot',
			metadata: '{}',
		},
	};
	return typedData;
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
			await expect(pkTest.decompressPublicKeyExternal('0x02fe0c28c123e475d8339f4912812aa278ffd28718d617d794ee599f6ec63fb3e7'))
				.to.eventually.equal('0xfe0c28c123e475d8339f4912812aa278ffd28718d617d794ee599f6ec63fb3e759355af4624e5708c1e9e09502731de59790499d5c0138ac689eebfab6087274');
		});
		it('Should compute a public address', async () => {
			const {pkTest} = await deployPkTest();
			await expect(pkTest.ethAddressFromPublicKeyExternal('0xfe0c28c123e475d8339f4912812aa278ffd28718d617d794ee599f6ec63fb3e759355af4624e5708c1e9e09502731de59790499d5c0138ac689eebfab6087274'))
				.to.eventually.equal('0x6e28b69193fcF10127de6c0f631BA421dB0B1fA7');
		});
	});
});

describe('Dark DAO Token', () => {
	async function getAccounts() {
		// Contracts are deployed using the first signer/account by default
		const owner = await ethers.getSigner();
		const ownerPublic = (new ethers.Wallet('0x519028d411cec86054c9c35903928eed740063336594f1b3b076fce119238f6a')).connect(publicProvider);
		return {owner, ownerPublic};
	}

	async function deployToken() {
		const {owner, ownerPublic} = await getAccounts();

		// On Ethereum
		const daoTokenFactory = await ethers.getContractFactory('TestERC20Token', ownerPublic);
		const daoToken = await daoTokenFactory.deploy();
		await daoToken.deployed();

		// On Oasis
		const blockHeaderOracleFactory = await ethers.getContractFactory('TrivialBlockHashOracle');
		const blockHeaderOracle = await blockHeaderOracleFactory.deploy();
		await blockHeaderOracle.deployed();
		const stateVerifierFactory = await ethers.getContractFactory('ProvethVerifier');
		const stateVerifier = await stateVerifierFactory.deploy();
		await stateVerifier.deployed();
		const transactionSerializerFactory = await ethers.getContractFactory('TransactionSerializer');
		const transactionSerializer = await transactionSerializerFactory.deploy();
		await transactionSerializer.deployed();
		const eip712UtilsFactory = await ethers.getContractFactory('EIP712Utils');
		const eip712Utils = await eip712UtilsFactory.deploy();
		await eip712Utils.deployed();

		// On Oasis
		// Calculate the address of the DD token
		const nvDaoTokenPredictedAddress = ethers.utils.getContractAddress({
			from: owner.address,
			nonce: await publicProvider.getTransactionCount(owner.address) + (oasisTestChainId === ethTestChainId ? 1 : 0),
		});
		const darkDaoFactory = await ethers.getContractFactory('VoteSellingDarkDAO', {
			libraries: {
				EIP712Utils: eip712Utils.address,
				TransactionSerializer: transactionSerializer.address,
			},
		});

		// 1 ROSE
		const minimumBid = (10n ** 18n) * 1n;

		// An auction for a proposal must begin earlier than this amount of time before the proposal ends
		// for the votes to be usable.
		// During testing, we use a very short time of 1 minute.
		const auctionDuration = 60;

		// Lockup period before DD token minting is allowed
		const depositLockupDuration = 0;

		const dd = await darkDaoFactory.deploy(
			blockHeaderOracle.address, stateVerifier.address, ethTestChainId, nvDaoTokenPredictedAddress, daoToken.address,
			daoTokenBalanceMappingSlot, ddTokenWithdrawalsSlot, ethers.BigNumber.from((10n ** 18n) * 8n),
			minimumBid, auctionDuration, depositLockupDuration);
		await dd.deployed();
		console.log('Dark DAO contract bytecode size:', ethers.utils.hexDataLength(darkDaoFactory.bytecode));

		// On Ethereum
		const nvDaoTokenFactory = await ethers.getContractFactory('DarkDAOToken', ownerPublic);
		const nvDaoToken = await nvDaoTokenFactory.deploy(daoToken.address, await dd.darkDaoSignerAddress());
		await nvDaoToken.deployed();
		expect(nvDaoToken.address).to.equal(nvDaoTokenPredictedAddress);

		await Promise.all([['State verifier', stateVerifier], ['Transaction serializer', transactionSerializer], ['EIP-712 Utils', eip712Utils], ['Dark DAO contract', dd], ['DD Token', nvDaoToken]].map(async (x: [string, any]) => {
			const [name, c] = x;
			if (!c.deployTransaction) {
				return null;
			}

			const txReceipt = await c.deployTransaction.wait();
			showTransactionResult(name + ' deployment', txReceipt);
		}));

		return {owner, ownerPublic, blockHeaderOracle, dd, daoToken, nvDaoToken, transactionSerializer};
	}

	async function depositTokens({dd, owner, ownerPublic, blockHeaderOracle, daoToken, nvDaoToken}: {dd: any; owner: ethers.Signer; ownerPublic: ethers.Signer; blockHeaderOracle: any; daoToken: any; nvDaoToken: any}, depositAmount: bigint) {
		const ddTokenRecipient = ownerPublic.address;

		const tdd = await TokenizedDarkDAO.create(dd, nvDaoToken, daoTokenBalanceMappingSlot);
		const depositData = await tdd.getDepositAddress(ddTokenRecipient);
		console.log('Deposit address:', depositData.depositAddress);

		showTransactionResult('Transfer DD tokens to deposit address', await daoToken.connect(ownerPublic).transfer(depositData.depositAddress, depositAmount).then(async t => t.wait()));
		const proofBlock = await publicProvider.getBlock('latest');
		await blockHeaderOracle.setBlockHash(proofBlock.number, proofBlock.hash);
		const storageProof = await tdd.getDepositProof(depositData, proofBlock.number, depositAmount);
		expect(ethers.utils.keccak256(storageProof.rlpBlockHeader)).to.equal(proofBlock.hash);

		showTransactionResult('Register deposit', await dd.registerDeposit(depositData.wrappedAddressInfo, proofBlock.number, storageProof).then(async t => t.wait()));
		const depositReceipt = await dd.getDeposit(0);
		console.log('Deposit receipt:', depositReceipt);

		// Mint the nvDAO tokens
		console.log(depositReceipt.signature);
		const depositMessage = ethers.utils.defaultAbiCoder.encode(['string', 'address', 'uint256', 'bytes32'], ['deposit', ddTokenRecipient, depositAmount, depositReceipt.depositId]);
		const depositSignature = derToEthSignature(depositReceipt.signature, ethers.utils.keccak256(depositMessage), await dd.darkDaoSignerAddress(), false);
		showTransactionResult('Mint DD tokens', await nvDaoToken.finalizeDeposit(ddTokenRecipient, depositAmount, depositReceipt.depositId, depositSignature).then(async tx => tx.wait()));
		const nvDaoTokenBal = await nvDaoToken.balanceOf(ddTokenRecipient);
		expect(nvDaoTokenBal).to.equal(depositAmount);
		return {depositAddress: depositData.depositAddress, ddTokenRecipient};
	}

	async function beginWithdrawal(ddTokenHolder, nvDaoToken, withdrawalAmount) {
		const witness = ethers.utils.randomBytes(32);
		const nonceHash = ethers.utils.keccak256(witness);
		showTransactionResult('Begin withdrawal to DD contract', await nvDaoToken.connect(ddTokenHolder).beginWithdrawal(withdrawalAmount, nonceHash).then(async tx => tx.wait()));
		return {witness, nonceHash};
	}

	async function registerWithdrawal(ddTokenHolder, withdrawalAmount, nonceHash, witness, nvDaoToken, dd, withdrawalRecipient, bribesRecipient, blockHeaderOracle = undefined) {
		// Calculate the storage slot
		const withdrawalHash = ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(['string', 'address', 'uint256', 'bytes32'], ['withdrawal', ddTokenHolder.address, withdrawalAmount, nonceHash]));
		const withdrawalStorageSlot = getMappingStorageSlot(withdrawalHash, ddTokenWithdrawalsSlot);
		// Get the withdrawal proof
		const proofBlock = await publicProvider.getBlock('latest');
		if (blockHeaderOracle) {
			await blockHeaderOracle.setBlockHash(proofBlock.number, proofBlock.hash);
		}

		const proofBlockNumberRpcString = ethers.BigNumber.from(proofBlock.number).toHexString().replaceAll('0x0', '0x');
		const proof = await publicProvider.send('eth_getProof', [nvDaoToken.address, [withdrawalStorageSlot], proofBlockNumberRpcString]);
		expect(ethers.BigNumber.from(proof.storageProof[0].value).eq(withdrawalAmount)).to.be.true;

		// Get the RLP-encoded block header for this block
		const rawProofBlockHeader = await publicProvider.send('debug_getRawHeader', [proofBlockNumberRpcString]);
		expect(ethers.utils.keccak256(rawProofBlockHeader)).to.equal(proofBlock.hash);

		// Register the withdrawal with the proof
		console.log('Registering withdrawal...');
		const storageProof = {
			rlpBlockHeader: rawProofBlockHeader,
			addr: nvDaoToken.address,
			storageSlot: withdrawalStorageSlot,
			accountProofStack: ethers.utils.RLP.encode(proof.accountProof.map(rlpValue => ethers.utils.RLP.decode(rlpValue))),
			storageProofStack: ethers.utils.RLP.encode(proof.storageProof[0].proof.map(rlpValue => ethers.utils.RLP.decode(rlpValue))),
		};

		showTransactionResult('Register withdrawal', await dd.registerWithdrawal(ddTokenHolder.address, withdrawalAmount, nonceHash, witness, withdrawalRecipient, bribesRecipient, proofBlock.number, storageProof).then(async tx => tx.wait()));
	}

	async function getTxInclusionProof(blockNumber: number, txIndex: number) {
		const rawBlock = await publicProvider.send('debug_getRawBlock', [getRpcUint(blockNumber)]);
		const blockRlp = ethers.utils.RLP.decode(rawBlock);
		const blockHeader: string[] = blockRlp[0];
		const rawTransactions: string[] = blockRlp[1];
		console.log(rawTransactions);

		// Build Merkle tree
		const trie = new Trie();
		for (const [i, rawTransaction] of rawTransactions.entries()) {
			await trie.put(getRlpUint(i), rawTransaction);
		}

		// Ensure the transaction root was constructed the same way
		const txRoot = ethers.utils.hexlify(await trie.root());
		expect(txRoot).to.equal(blockHeader[4]);
		expect(txIndex).to.be.lessThan(rawTransactions.length);

		// Generate the proof of the transaction
		const txProof = await trie.createProof(getRlpUint(txIndex));
		const txProofHex = txProof.map(x => ethers.utils.hexlify(x));
		return {
			rlpBlockHeader: ethers.utils.RLP.encode(blockHeader),
			proof: txProofHex,
		};
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
			const depositAmount = (10n ** 18n) * 100n;
			await depositTokens({dd, owner, blockHeaderOracle, daoToken, nvDaoToken, ownerPublic}, depositAmount);
		});
	});

	describe('Voting', () => {
		it('Should allow incremental bids', async () => {
			const {dd, owner, blockHeaderOracle, daoToken, nvDaoToken, ownerPublic} = await deployToken();
			const depositAmount = (10n ** 18n) * 100n;
			const {depositAddress} = await depositTokens({dd, owner, blockHeaderOracle, daoToken, nvDaoToken, ownerPublic}, depositAmount);

			const proposalHash = '0x0df596950bfc99035520c0de4d1aae5c1bb0bc626605e5d0b744ff1d90e3a981';
			showTransactionResult('Create auction', await dd.createAuction(proposalHash, {value: ethers.utils.parseEther('1')}).then(async tx => tx.wait()));
			showTransactionResult('Bid on auction', await dd.bid(proposalHash, ethers.utils.parseEther('1.1'), {value: ethers.utils.parseEther('0.1')}).then(async tx => tx.wait()));
			await expect(dd.getMaxBid(proposalHash)).to.eventually.equal(ethers.utils.parseEther('1.1'));
		});
		it('Should allow auction winner to sign votes', async () => {
			const {dd, owner, blockHeaderOracle, daoToken, nvDaoToken, ownerPublic} = await deployToken();
			const depositAmount = (10n ** 18n) * 100n;
			const {depositAddress} = await depositTokens({dd, owner, blockHeaderOracle, daoToken, nvDaoToken, ownerPublic}, depositAmount);

			const proposalHash = '0x0df596950bfc99035520c0de4d1aae5c1bb0bc626605e5d0b744ff1d90e3a981';
			await dd.createAuction(proposalHash, {value: ethers.utils.parseEther('1')}).then(async tx => tx.wait());
			await new Promise<void>(resolve => setTimeout(resolve, 60 * 1000));
			// Trigger new block to be created on the dev network
			await owner.sendTransaction({to: owner.address, data: '0x'});

			// Sign vote
			const proposalData = getSnapshotVoteTypedData(depositAddress, proposalHash);
			const proposalParameters = getTypedDataParams(proposalData);
			const derSignature = await dd.signVote(depositAddress, proposalParameters.domainParams, proposalParameters.typeString, proposalParameters.encodedData);
			const dataHash = ethers.utils._TypedDataEncoder.hash(proposalData.domain, proposalData.types, proposalData.message);
			const ethSig = derToEthSignature(derSignature, dataHash, depositAddress, false);
			expect(ethers.utils.verifyTypedData(proposalData.domain, proposalData.types, proposalData.message, ethSig)).to.equal(depositAddress);
		});
	});

	describe('Withdrawals', () => {
		it('Should allow a withdrawal to be registered and processed', async () => {
			const {dd, owner, blockHeaderOracle, daoToken, nvDaoToken, ownerPublic} = await deployToken();
			const depositAmount = (10n ** 18n) * 100n;
			const {ddTokenRecipient, depositAddress} = await depositTokens({dd, owner, blockHeaderOracle, daoToken, nvDaoToken, ownerPublic}, depositAmount);

			const withdrawalAmount = depositAmount / 2n;
			const {witness, nonceHash} = await beginWithdrawal(ownerPublic, nvDaoToken, withdrawalAmount);
			// Lol account (Ethereum account receiving the DAO tokens)
			const withdrawalRecipient = '0xc42A84D4f2f511f90563dc984311Ab737ee56eFD';
			// Lol2 (Oasis account receiving the portion of the accumulated bribes + equalizing deposits)
			const bribesRecipient = '0x15B5F4c6F916d7E1B742deb0b06fd25a0490ef55';
			await registerWithdrawal(ownerPublic, withdrawalAmount, nonceHash, witness, nvDaoToken, dd, withdrawalRecipient, bribesRecipient, blockHeaderOracle);

			// Get withdrawal tx
			const withdrawalAddress = depositAddress;
			const withdrawalTx = await dd.getSignedWithdrawalTransaction(withdrawalRecipient);
			const ethSig = derToEthSignature(withdrawalTx.signature, ethers.utils.keccak256(withdrawalTx.unsignedTx), withdrawalAddress, false);
			const signedWithdrawalTx = ethers.utils.serializeTransaction(ethers.utils.parseTransaction(withdrawalTx.unsignedTx), ethSig);

			// Fund the account
			// TODO: Ensure these transactions can still be included despite max gas price not being fulfilled
			await ownerPublic.sendTransaction({to: withdrawalAddress, value: ethers.utils.parseEther('0.1')}).then(async tx => tx.wait());
			await publicProvider.sendTransaction(signedWithdrawalTx).then(async tx => tx.wait());

			const withdrawnBalance = await daoToken.balanceOf(withdrawalRecipient);
			expect(withdrawnBalance.eq(withdrawalAmount)).to.be.true;
		});

		it('Should generate a transaction inclusion proof', async () => {
			const {ownerPublic} = await getAccounts();
			const txReceipt = await ownerPublic.sendTransaction({to: ownerPublic.address}).then(async tx => tx.wait());
			console.log(await getTxInclusionProof(txReceipt.blockNumber, txReceipt.transactionIndex));
		});

		it('Should accept withdrawal inclusion proofs', async () => {
			const {dd, owner, blockHeaderOracle, daoToken, nvDaoToken, ownerPublic, transactionSerializer} = await deployToken();
			const depositAmount = (10n ** 18n) * 100n;
			const {ddTokenRecipient, depositAddress} = await depositTokens({dd, owner, blockHeaderOracle, daoToken, nvDaoToken, ownerPublic}, depositAmount);

			const withdrawalAmount = depositAmount / 2n;
			const {witness, nonceHash} = await beginWithdrawal(ownerPublic, nvDaoToken, withdrawalAmount);
			// Lol account
			const withdrawalRecipient = '0xc42A84D4f2f511f90563dc984311Ab737ee56eFD';
			await registerWithdrawal(ownerPublic, withdrawalAmount, nonceHash, witness, nvDaoToken, dd, withdrawalRecipient, withdrawalRecipient, blockHeaderOracle);

			// Get withdrawal tx
			const withdrawalAddress = depositAddress;
			const withdrawalTx = await dd.getSignedWithdrawalTransaction(withdrawalRecipient);
			const ethSig = derToEthSignature(withdrawalTx.signature, ethers.utils.keccak256(withdrawalTx.unsignedTx), withdrawalAddress, false);
			const signedWithdrawalTxRaw = ethers.utils.serializeTransaction(ethers.utils.parseTransaction(withdrawalTx.unsignedTx), ethSig);

			// Fund the account
			// TODO: Ensure these transactions can still be included despite max gas price not being fulfilled
			showTransactionResult('Fund DAO token withdrawal', await ownerPublic.sendTransaction({to: withdrawalAddress, value: ethers.utils.parseEther('0.1')}).then(async tx => tx.wait()));
			const txReceipt = await publicProvider.sendTransaction(signedWithdrawalTxRaw).then(async tx => tx.wait());
			showTransactionResult('DAO token transfer (estimate)', txReceipt);

			// Second withdrawal
			const {witness: witness2, nonceHash: nonceHash2} = await beginWithdrawal(ownerPublic, nvDaoToken, withdrawalAmount);
			await registerWithdrawal(ownerPublic, withdrawalAmount, nonceHash2, witness2, nvDaoToken, dd, withdrawalRecipient, withdrawalRecipient, blockHeaderOracle);

			// Get a proof of inclusion
			await blockHeaderOracle.setBlockHash(txReceipt.blockNumber, txReceipt.blockHash).then(async tx => tx.wait());
			const {proof, rlpBlockHeader} = await getTxInclusionProof(txReceipt.blockNumber, txReceipt.transactionIndex);
			console.log('Transaction inclusion proof:', proof);

			// Submit proof to Dark DAO!
			// This can be gathered from the transaction data of the included transaction
			const signedWithdrawalTx = ethers.utils.parseTransaction(signedWithdrawalTxRaw);
			const signedTxFormatted = {
				transaction: {
					chainId: signedWithdrawalTx.chainId,
					nonce: signedWithdrawalTx.nonce,
					maxPriorityFeePerGas: signedWithdrawalTx.maxPriorityFeePerGas,
					maxFeePerGas: signedWithdrawalTx.maxFeePerGas,
					gasLimit: signedWithdrawalTx.gasLimit,
					destination: signedWithdrawalTx.to,
					amount: signedWithdrawalTx.value,
					payload: signedWithdrawalTx.data,
				},
				r: signedWithdrawalTx.r,
				s: signedWithdrawalTx.s,
				v: signedWithdrawalTx.v,
			};
			console.log(signedTxFormatted, signedWithdrawalTxRaw, signedWithdrawalTx);
			showTransactionResult('Prove withdrawal inclusion', await dd.proveWithdrawalInclusion(
				withdrawalRecipient,
				withdrawalAmount,
				signedTxFormatted,
				{
					rlpBlockHeader,
					transactionIndexRlp: getRlpUint(txReceipt.transactionIndex),
					transactionProofStack: ethers.utils.RLP.encode(proof.map(rlpList => ethers.utils.RLP.decode(rlpList))),
				},
				txReceipt.blockNumber,
			).then(async tx => tx.wait()));

			console.log('Getting second signed withdrawal transaction...');
			const newTx = await dd.getSignedWithdrawalTransaction(withdrawalRecipient);
			const ethSig2 = derToEthSignature(newTx.signature, ethers.utils.keccak256(newTx.unsignedTx), withdrawalAddress, false);
			const signedWithdrawalTxRaw2 = ethers.utils.serializeTransaction(ethers.utils.parseTransaction(newTx.unsignedTx), ethSig);
			const signedWithdrawalTx2 = ethers.utils.parseTransaction(signedWithdrawalTxRaw2);
			expect(signedWithdrawalTx2.nonce).to.equal(1);
		});
	});
});
