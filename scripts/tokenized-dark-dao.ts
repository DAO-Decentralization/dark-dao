import {ethers} from 'ethers';

export function getMappingStorageSlot(mappingKey: string | number, mappingSlot: string | number): string {
	return ethers.utils.keccak256(ethers.utils.hexConcat([ethers.utils.hexZeroPad(mappingKey, 32), ethers.utils.hexZeroPad(mappingSlot, 32)]));
}

export function getRpcUint(number: any): string {
	return ethers.BigNumber.from(number).toHexString().replaceAll('0x0', '0x');
}

export function getRlpUint(number: any): string {
	return number > 0 ? ethers.utils.RLP.encode(ethers.utils.arrayify(number)) : ethers.utils.RLP.encode('0x');
}

export class TokenizedDarkDAO {
	darkDao: ethers.Contract;
	ddToken: ethers.Contract;
	targetDaoTokenAddress: string;
	daoTokenBalanceMappingSlot: string;

	private constructor() {}

	public static async create(darkDao: ethers.Contract, ddToken: ethers.Contract, daoTokenBalanceMappingSlot: string): Promise<TokenizedDarkDAO> {
		const tdd = new TokenizedDarkDAO();
		tdd.darkDao = darkDao;
		tdd.ddToken = ddToken;
		tdd.daoTokenBalanceMappingSlot = daoTokenBalanceMappingSlot;
		tdd.targetDaoTokenAddress = await tdd.darkDao.ethDaoToken();
		return tdd;
	}

	async getDepositAddress(ddTokenRecipient: string) {
		return this.darkDao.generateDepositAddress(ddTokenRecipient);
	}

	async getDepositProof(depositData: {depositAddress: string; wrappedAddressInfo: string}, proofBlockNumber?: number, expectedValue?: ethers.BigNumber) {
		const blockNumber = proofBlockNumber || await this.ddToken.getBlock('latest');

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
			accountProofStack: ethers.utils.RLP.encode(proof.accountProof.map(rlpValue => ethers.utils.RLP.decode(rlpValue))),
			storageProofStack: ethers.utils.RLP.encode(proof.storageProof[0].proof.map(rlpValue => ethers.utils.RLP.decode(rlpValue))),
		};
		return storageProof;
	}
}
