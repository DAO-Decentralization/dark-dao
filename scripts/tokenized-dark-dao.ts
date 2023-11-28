import {ethers, BytesLike} from 'ethers';
import {Trie} from '@ethereumjs/trie';
import {derToEthSignature} from './ethereum-signatures';

export function getMappingStorageSlot(mappingKey: BytesLike, mappingSlot: BytesLike): string {
	return ethers.utils.keccak256(ethers.utils.hexConcat([ethers.utils.hexZeroPad(mappingKey, 32), ethers.utils.hexZeroPad(mappingSlot, 32)]));
}

export function getRpcUint(number: any): string {
	return ethers.BigNumber.from(number).toHexString().replaceAll('0x0', '0x');
}

export function getRlpUint(number: any): string {
	return number > 0 ? ethers.utils.RLP.encode(ethers.utils.arrayify(number)) : ethers.utils.RLP.encode('0x');
}

export async function getTxInclusionProof(provider: ethers.providers.JsonRpcProvider, blockNumber: number, txIndex: number): Promise<{rlpBlockHeader: string; proof: string[]}> {
	const rawBlock = await provider.send('debug_getRawBlock', [getRpcUint(blockNumber)]);
	const blockRlp = ethers.utils.RLP.decode(rawBlock);
	const blockHeader: string[] = blockRlp[0];
	const rawTransactions: string[] = blockRlp[1];

	// Build Merkle tree
	const trie = new Trie();
	for (const [i, rawTransaction] of rawTransactions.entries()) {
		await trie.put(ethers.utils.arrayify(getRlpUint(i)), ethers.utils.arrayify(rawTransaction));
	}

	// Ensure the transaction root was constructed the same way
	const txRoot = ethers.utils.hexlify(trie.root());
	if (txRoot != blockHeader[4]) {
		throw new Error('Constructed transaction Merkle tree has a root inconsistent with the transactionsRoot in the block header');
	}

	if (txIndex >= rawTransactions.length) {
		throw new Error('Transaction index is outside the range of this block');
	}

	// Generate the proof of the transaction
	const txProof = await trie.createProof(ethers.utils.arrayify(getRlpUint(txIndex)));
	const txProofHex = txProof.map(x => ethers.utils.hexlify(x));
	return {
		rlpBlockHeader: ethers.utils.RLP.encode(blockHeader),
		proof: txProofHex,
	};
}

export class TokenizedDarkDAO {
	darkDao: ethers.Contract;
	ddToken: ethers.Contract;
	targetDaoTokenAddress: string;
	daoTokenBalanceMappingSlot: string;
	ddTokenWithdrawalsSlot: string;

	private constructor() {
	    this.darkDao = new ethers.Contract("0x0000000000000000000000000000000000000000", []);
	    this.ddToken = new ethers.Contract("0x0000000000000000000000000000000000000000", []);
	    this.targetDaoTokenAddress = "";
	    this.daoTokenBalanceMappingSlot = "";
	    this.ddTokenWithdrawalsSlot = "";
	}

	public static async create(darkDao: ethers.Contract, ddToken: ethers.Contract, daoTokenBalanceMappingSlot: string, ddTokenWithdrawalsSlot: string): Promise<TokenizedDarkDAO> {
		const tdd = new TokenizedDarkDAO();
		tdd.darkDao = darkDao;
		tdd.ddToken = ddToken;
		tdd.daoTokenBalanceMappingSlot = daoTokenBalanceMappingSlot;
		tdd.ddTokenWithdrawalsSlot = ddTokenWithdrawalsSlot;
		tdd.targetDaoTokenAddress = await tdd.darkDao.ethDaoToken();
		return tdd;
	}

	async generateDepositAddress(ddTokenRecipient: string) {
		return this.darkDao.generateDepositAddress(ddTokenRecipient);
	}

	async getDepositProof(depositData: {depositAddress: string; wrappedAddressInfo: string}, proofBlockNumber?: number, expectedValue?: ethers.BigNumber) {
		const blockNumber = proofBlockNumber || await this.ddToken.provider.getBlock('latest');

		const depositStorageSlot = getMappingStorageSlot(depositData.depositAddress, this.daoTokenBalanceMappingSlot);
		const proofBlockNumberRpcString = getRpcUint(blockNumber);
		const publicProvider = this.ddToken.provider as ethers.providers.JsonRpcProvider;
		const proof = await publicProvider.send('eth_getProof', [this.targetDaoTokenAddress, [depositStorageSlot], proofBlockNumberRpcString]);

		if (expectedValue !== undefined && !expectedValue.eq(proof.storageProof[0].value)) {
			throw new Error('Storage proof does not prove expected value');
		}

		// Get the RLP-encoded block header for this block
		const rawProofBlockHeader = await publicProvider.send('debug_getRawHeader', [proofBlockNumberRpcString]);

		const storageProof = {
			rlpBlockHeader: rawProofBlockHeader,
			addr: this.targetDaoTokenAddress,
			storageSlot: depositStorageSlot,
			accountProofStack: ethers.utils.RLP.encode(proof.accountProof.map((rlpValue: string) => ethers.utils.RLP.decode(rlpValue))),
			storageProofStack: ethers.utils.RLP.encode(proof.storageProof[0].proof.map((rlpValue: string) => ethers.utils.RLP.decode(rlpValue))),
		};
		return storageProof;
	}

	async registerDeposit(wrappedAddressInfo: string, proofBlockNumber: number, storageProof: any) {
		return this.darkDao.registerDeposit(wrappedAddressInfo, proofBlockNumber, storageProof);
	}

	async mintDDTokens(depositIndex: number) {
		// TODO: Pass up other deposits
		const depositReceipt = await this.darkDao.getDeposit(depositIndex);
		const depositMessage = ethers.utils.defaultAbiCoder.encode(['string', 'address', 'uint256', 'bytes32'], ['deposit', depositReceipt.recipient, depositReceipt.amount, depositReceipt.depositId]);
		const depositSignature = derToEthSignature(depositReceipt.signature, ethers.utils.keccak256(depositMessage), await this.darkDao.darkDaoSignerAddress(), false);
		return this.ddToken.finalizeDeposit(depositReceipt.recipient, depositReceipt.amount, depositReceipt.depositId, depositSignature);
	}

	async beginWithdrawal(withdrawalAmount: bigint) {
		const witness = ethers.utils.randomBytes(32);
		const nonceHash = ethers.utils.keccak256(witness);
		const tx = await this.ddToken.beginWithdrawal(withdrawalAmount, nonceHash);
		return {witness, nonceHash, tx};
	}

	async registerWithdrawal(ddTokenHolder: string, withdrawalAmount: bigint, nonceHash: string, witness: string, daoTokenRecipient: string, bribesRecipient: string, proofBlockNumber?: number) {
		// Calculate the storage slot
		const withdrawalHash = ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(['string', 'address', 'uint256', 'bytes32'], ['withdrawal', ddTokenHolder, withdrawalAmount, nonceHash]));
		const withdrawalStorageSlot = getMappingStorageSlot(withdrawalHash, this.ddTokenWithdrawalsSlot);
		// Get the withdrawal proof
		const publicProvider = this.ddToken.provider as ethers.providers.JsonRpcProvider;
		const proofBlock = await publicProvider.getBlock(proofBlockNumber === undefined ? 'latest' : proofBlockNumber);

		const proofBlockNumberRpcString = getRpcUint(proofBlock.number);
		const proof = await publicProvider.send('eth_getProof', [this.ddToken.address, [withdrawalStorageSlot], proofBlockNumberRpcString]);
		if (!ethers.BigNumber.from(withdrawalAmount).eq(proof.storageProof[0].value)) {
			throw new Error('Withdrawal storage proof does not prove expected withdrawal amount: expected ' + withdrawalAmount + ' but got ' + proof.storageProof[0].value);
		}

		// Get the RLP-encoded block header for this block
		const rawProofBlockHeader = await publicProvider.send('debug_getRawHeader', [proofBlockNumberRpcString]);

		// Register the withdrawal with the proof
		const storageProof = {
			rlpBlockHeader: rawProofBlockHeader,
			addr: this.ddToken.address,
			storageSlot: withdrawalStorageSlot,
			accountProofStack: ethers.utils.RLP.encode(proof.accountProof.map((rlpValue: string) => ethers.utils.RLP.decode(rlpValue))),
			storageProofStack: ethers.utils.RLP.encode(proof.storageProof[0].proof.map((rlpValue: string) => ethers.utils.RLP.decode(rlpValue))),
		};

		return this.darkDao.registerWithdrawal(ddTokenHolder, withdrawalAmount, nonceHash, witness, daoTokenRecipient, bribesRecipient, proofBlock.number, storageProof);
	}

	async getWithdrawalTransaction(withdrawalRecipient: string): Promise<string> {
		const withdrawalTx = await this.darkDao.getSignedWithdrawalTransaction(withdrawalRecipient);
		const ethSig = derToEthSignature(withdrawalTx.signature, ethers.utils.keccak256(withdrawalTx.unsignedTx), withdrawalTx.withdrawalAccount, false);
		const signedWithdrawalTxRaw = ethers.utils.serializeTransaction(ethers.utils.parseTransaction(withdrawalTx.unsignedTx), ethSig);
		return signedWithdrawalTxRaw;
	}

	async proveWithdrawalInclusion(txHash: string) {
		const signedWithdrawalTx = await this.ddToken.provider.getTransaction(txHash);
		const txReceipt = await this.ddToken.provider.getTransactionReceipt(txHash);
		const {proof, rlpBlockHeader} = await getTxInclusionProof(this.ddToken.provider as ethers.providers.JsonRpcProvider, txReceipt.blockNumber, txReceipt.transactionIndex);
		console.log('Transaction inclusion proof:', proof);

		// Submit proof to Dark DAO!
		// This can be gathered from the transaction data of the included transaction
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
		console.log(signedTxFormatted, signedWithdrawalTx);
		const erc20Int = new ethers.utils.Interface([
			'function transfer(address to, uint256 value) public',
		]);
		const transferData = erc20Int.decodeFunctionData('transfer', signedWithdrawalTx.data);
		return this.darkDao.proveWithdrawalInclusion(
			transferData.to,
			transferData.value,
			signedTxFormatted,
			{
				rlpBlockHeader,
				transactionIndexRlp: getRlpUint(txReceipt.transactionIndex),
				transactionProofStack: ethers.utils.RLP.encode(proof.map(rlpList => ethers.utils.RLP.decode(rlpList))),
			},
			txReceipt.blockNumber,
		);
	}
}
