import {time, loadFixture} from '@nomicfoundation/hardhat-network-helpers';
import {anyValue} from '@nomicfoundation/hardhat-chai-matchers/withArgs';
import {expect} from 'chai';
import {ethers} from 'hardhat';
import * as sapphire from '@oasisprotocol/sapphire-paratime';
import {StandardMerkleTree} from '@openzeppelin/merkle-tree';
import {createEthereumMessage, derToEthSignature} from '../scripts/ethereum-signatures';
import {getDomainParams} from '../scripts/eip712-builder';

function getCurrentTime() {
	return Math.floor(Date.now() / 1000);
}

function getSnapshotVoteTypedData(address: string) {
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
			proposal: '0x85cfd1e3f1fe4734f5e63b9f9578f8c5255696e0adab20b07ae48ae26d2be1fb',
			choice: '1',
			reason: '',
			app: 'snapshot',
			metadata: '{}',
		},
	};
	return typedData;
}

describe('Snapshot Dark DAO', () => {
	async function deployWallet() {
		// Contracts are deployed using the first signer/account by default
		const [owner, voterOasis] = await ethers.getSigners();

		const EIP712Utils = await ethers.getContractFactory('EIP712Utils');
		const eip712Utils = await EIP712Utils.deploy();

		const BasicEncumberedWallet = await ethers.getContractFactory('BasicEncumberedWallet', {
			libraries: {
				EIP712Utils: eip712Utils.address,
			},
		});

		const EIP712UtilsTest = await ethers.getContractFactory('EIP712UtilsTest', {
			libraries: {
				EIP712Utils: eip712Utils.address,
			},
		});
		const eip712UtilsTest = await EIP712UtilsTest.deploy();
		await eip712UtilsTest.deployed();

		const wallet = await BasicEncumberedWallet.deploy();
		const snapshotEncumbrancePolicy = await ethers.getContractFactory('SnapshotEncumbrancePolicy');
		const policy = await snapshotEncumbrancePolicy.deploy(wallet.address);
		return {owner, voterOasis, wallet, policy, eip712Utils, eip712UtilsTest};
	}

	async function deployAndEnter() {
		const {owner, voterOasis, wallet, policy, eip712Utils, eip712UtilsTest} = await deployWallet();
		await (await ethers.getSigner()).sendTransaction({to: voterOasis.getAddress(), value: ethers.utils.parseEther('10'), data: '0x'}).then(async c => c.wait());
		console.log('Voter balance: ' + (ethers.utils.formatEther(await ethers.provider.getBalance(voterOasis.getAddress()))));
		console.log('Creating voter wallet...');
		const voterWallet = wallet.connect(voterOasis);
		await voterWallet.createWallet(0).then(async c => c.wait());
		console.log('Entering encumbrance contract...');
		await voterWallet.enterEncumbranceContract(0, policy.address, getCurrentTime() + (60 * 60), '0x').then(async c => c.wait());

		console.log('Creating owner wallet...');
		await wallet.createWallet(0).then(async c => c.wait());
		console.log('Entering encumbrance contract...');
		await wallet.enterEncumbranceContract(0, policy.address, getCurrentTime() + (60 * 60), '0x').then(async c => c.wait());

		// Assume the Snapshot is taken right now
		const snapshotTimestamp = getCurrentTime();

		console.log('Getting owner address...');
		const ownerAddress = await wallet.getAddress(0);
		console.log('Getting voter address...');
		const thing = new ethers.Contract(wallet.address, [
			'function getAddress(uint256 walletIndex) public view returns (address)',
		], voterOasis);
		// Const voterAddress = await thing.getAddress(0);
		console.log('Creating Merkle tree...');
		const merkleTreeData = [
			[ownerAddress, ethers.utils.parseEther('10'), ethers.utils.parseEther('0.1')],
			// [voterAddress, ethers.utils.parseEther('20'), ethers.utils.parseEther('0.2')],
		];
		const bribeMerkleTree = StandardMerkleTree.of(merkleTreeData, ['address', 'uint256', 'uint256']);

		// Deploy Dark DAO
		const SnapshotDarkDAO = await ethers.getContractFactory('SnapshotDarkDAO');
		console.log('Deploying Dark DAO...');
		const darkDao = await SnapshotDarkDAO.deploy(
			policy.address,
			getSnapshotVoteTypedData(ownerAddress).message.proposal,
			getCurrentTime(),
			getCurrentTime() + (60 * 30),
			bribeMerkleTree.root,
			// Fund with some bribe money
			{value: ethers.utils.parseEther('1')},
		);

		return {owner, voterOasis, wallet, policy, darkDao, bribeMerkleTree, eip712UtilsTest};
	}

	describe('Snapshot Dark DAO', () => {
		it('Should accept members of the Merkle Tree and sign votes on their behalf', async () => {
			const {owner, voterOasis, wallet, policy, darkDao, bribeMerkleTree, eip712UtilsTest} = await deployAndEnter();
			const ownerAddress = await wallet.getAddress(0);
			// Enter the Dark DAO!
			console.log(Array.from(bribeMerkleTree.entries()));
			const ownerLeaf = Array.from(bribeMerkleTree.entries()).map(x => x[1]).find(([address, votingPower, bribe]) => address === ownerAddress);
			const ownerProof = bribeMerkleTree.getProof(ownerLeaf);
			console.log('owner leaf', ownerLeaf);
			console.log('owner proof', ownerProof);
			// Fail if the Dark DAO is not the vote signer
			await expect(darkDao.enterDarkDAO(ownerAddress, ownerLeaf[1], ownerLeaf[2], ownerProof)).to.be.reverted;

			const typedData = getSnapshotVoteTypedData(ownerAddress);
			const proposal = typedData.message.proposal;
			await policy.setVoteSigner(ownerAddress, proposal, darkDao.address)
				.then(async x => x.wait());
			// Succeed now that the Dark DAO is the vote signer
			await expect(darkDao.enterDarkDAO(ownerAddress, ownerLeaf[1], ownerLeaf[2], ownerProof)).to.not.be.reverted;
			// Sign a voting message (since owner == briber)
			const typedDataEnc = ethers.utils._TypedDataEncoder.from(typedData.types);
			const typeString = typedDataEnc.encodeType('Vote');
			console.log('Type string: ' + typeString);
			console.log('Type string keccak: ' + ethers.utils.keccak256(ethers.utils.toUtf8Bytes(typeString)));
			const encodedData = ethers.utils.hexDataSlice(typedDataEnc.encodeData('Vote', typedData.message), 32);
			const derSignature = await darkDao.signVote(ownerAddress, getDomainParams(typedData.domain), typeString, encodedData);
			const dataHash = await eip712UtilsTest.getTypedDataHash(getDomainParams(typedData.domain), typeString, encodedData);
			const ethSig = derToEthSignature(derSignature, dataHash, ownerAddress, false);
			console.log(ethSig);
			expect(ethers.utils.verifyTypedData(typedData.domain, typedData.types, typedData.message, ethSig)).to.equal(ownerAddress);
		});

		it('Should pay a bribe to a registered account', async () => {
			const {owner, voterOasis, wallet, policy, darkDao, bribeMerkleTree, eip712UtilsTest} = await deployAndEnter();
			const ownerAddress = await wallet.getAddress(0);
			// Fail to pay bribe before registering
			await expect(darkDao.claimBribe(ownerAddress)).to.be.reverted;
			const ownerLeaf = Array.from(bribeMerkleTree.entries()).map(x => x[1]).find(([address, votingPower, bribe]) => address === ownerAddress);
			const ownerProof = bribeMerkleTree.getProof(ownerLeaf);
			await policy.setVoteSigner(ownerAddress, getSnapshotVoteTypedData(ownerAddress).message.proposal, darkDao.address)
				.then(async x => x.wait());

			const enterDarkDaoTx = await darkDao.enterDarkDAO(ownerAddress, ownerLeaf[1], ownerLeaf[2], ownerProof).then(async tx => tx.wait());
			expect(enterDarkDaoTx.status).to.equal(1);
			console.log('enterDarkDAO gas cost:', enterDarkDaoTx.cumulativeGasUsed.toString());

			const previousBalance = await ethers.provider.getBalance(owner.address);
			const claimBribeTx = await darkDao.claimBribe(ownerAddress).then(async tx => tx.wait());
			expect(claimBribeTx.status).to.equal(1);
			console.log('claimBribe gas cost:', claimBribeTx.cumulativeGasUsed.toString());
			const afterBalance = await ethers.provider.getBalance(owner.address);
			// Check for payment, allowing for transaction costs
			expect(afterBalance.sub(previousBalance).gt(ownerLeaf[2].sub(ethers.utils.parseEther('0.03')))).to.be.true;

			// Fail to pay bribe more than once
			await expect(darkDao.claimBribe(ownerAddress)).to.be.reverted;

			// Withdraw excess funds back to briber
			const previousBriberBalance = await ethers.provider.getBalance(owner.address);
			await darkDao.withdrawUnusedFunds();
			const afterBriberBalance = await ethers.provider.getBalance(owner.address);
			expect(afterBriberBalance.sub(previousBriberBalance).gt(0)).to.be.true;
			expect(await ethers.provider.getBalance(darkDao.address)).to.equal(ethers.BigNumber.from(0));
		});
	});
});
