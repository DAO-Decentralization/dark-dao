import {expect} from 'chai';
import {ethers} from 'hardhat';
import {Block} from '@ethersproject/providers';
import gethBlockExample from './geth_block_example.json';

function byteArrayToNibbleArray(byteArray: Uint8Array): number[] {
	const result: number[] = Array.from({length: byteArray.length * 2});

	for (const [i, byte] of byteArray.entries()) {
		result[i * 2] = byte >> 4;
		result[(i * 2) + 1] = byte & 0x0F;
	}

	return result;
}

function getValue(value: string) {
	if (value === '0x') {
		return value;
	}

	if (value === '0x0') {
		return '0x';
	}

	return ethers.utils.hexlify(ethers.utils.arrayify(ethers.BigNumber.from(value)));
}

function getBlockHeaderAsRlp(block: any): string {
	return ethers.utils.RLP.encode([
		block.parentHash,
		block.sha3Uncles,
		block.miner,
		block.stateRoot,
		block.transactionsRoot,
		block.receiptsRoot,
		block.logsBloom,
		getValue(block.difficulty),
		getValue(block.number),
		getValue(block.gasLimit),
		getValue(block.gasUsed),
		getValue(block.timestamp),
		block.extraData,
		block.mixHash,
		block.nonce,
		getValue(block.baseFeePerGas),
		block.withdrawalsRoot,
	]);
}

describe('Proveth state proofs', () => {
	async function deployProveth() {
		// Contracts are deployed using the first signer/account by default
		const owner = await ethers.getSigner();

		// On Ethereum
		const verifierFactory = await ethers.getContractFactory('ProvethVerifier');
		const verifier = await verifierFactory.deploy();
		await verifier.deployed();

		return {owner, verifier};
	}

	describe('Token deployment', () => {
		it('Should validate a Merkle-Patricia proof', async () => {
			const {owner, verifier} = await deployProveth();
			// {"cat": "Nibbles", "name": "Jonas"}
			const result = await verifier.exposedValidateMPTProof('0x4eea4a6f6d8c8f38916be012f4a59cb2d57be056b17d65a9be42d3967389f650',
				ethers.utils.hexlify(byteArrayToNibbleArray(ethers.utils.arrayify('0x636174'))),
				ethers.utils.RLP.encode([
					['0x16', '0x39a7f356226f5cf3754fb4dac8c325b308f7eb49dd709d7fbca74717fbc9264d'],
					['0x', '0x', '0x', ['0x206174', '0x4e6962626c6573'], '0x', '0x', '0x', '0x', '0x', '0x', '0x', '0x', '0x', '0x', ['0x20616d65', '0x4a6f6e6173'], '0x', '0x'],
					['0x206174', '0x4e6962626c6573'],
				]),
			);
		});

		it('Should prove the number of tokens held in a storage trie', async () => {
			const {owner, verifier} = await deployProveth();

			const storageSlot = '0x1b78f95ce9c545113830f6f7eec96f49712a408da3b4b03d72d06260f909dc15';
			const keyInStorageTrie = ethers.utils.keccak256(storageSlot);
			const keyNibbles = ethers.utils.hexlify(byteArrayToNibbleArray(ethers.utils.arrayify(keyInStorageTrie)));
			const result = await verifier.exposedValidateMPTProof('0x210c77b5d616c75b1106ab99dfea0670395e26fe4e3f16194c3a77b79eeaf283',
				keyNibbles,
				ethers.utils.RLP.encode([
					'0xf90211a0e1708e9ae46c09f48d1a357720b2598708a4a8828f76e2131db17d67d6c76407a0fc144ea47110100fee490c066d08ae164610d96f3f99549cded6a202999e6befa077baaa34645aefa585d51997db184372be9204d6990bb40462bcdedc2a51d21ca0184979cefb9e149eb9c639ada97c0a065d1e4035ed03131aa7945e06c31a3fbaa0c3edf55247a4bb0d0f43dc6787076997f2e87488854f6dbde168c96dea698c99a018a9566aaa49b4d064b68ca7122ee8cf1d365111e9235d285fcb634241d35317a00b53a04700434bfca5a679974952dae63bd12543ae953f445336932aba708462a011fd1c963383d12b89fac93bcd820e0486454d60e8fec85e13d59e5ef9d15810a05e7b3e9791c6bac9da7952e12ed9df04cbd2a3be2684ffdc97950800504281f9a042fe1097796a522f6afd5a262ab214a71264bd0786a4b95f1da74f431fb46123a0ac09a2db5e83b8a34b35cfd6c5288cce68129f45418b698c4fc3b53948357911a08e94cc8484130653984bc6035503a1719b2e882a11bd1441ac85e32148630ee6a09cb80f369f78116eb505337a5ea07d1ca3a31f17155f3bae1141109241d9aa5da0f849ff06e20a1617d749847e6b4cc424fc0b4bc69d6733c2afd5b2bee80c8613a0871c7e82e1888c6b162f4d632704349766f0fdae82add6a67e69134a9c36996aa0f6c6103d824953026feba409a0548a44098ae93cfe7689fde88119e42b669c5d80',
					'0xf90211a01da3c73865dcfc510dc8e169412504e6ad445ecb4e2c1adba207c0174790c757a0352c5cb95078cdb872dea09238b4cc9fe3aa8d50e70181c0bffcdae2b40b54f4a0ce995796573ea33aaa30b3fcbaa4fc89d89d86d13d972c65b62945e960c61603a09c017fbaade9f6a1ae510260cff77004862acff6711757b3b3a883beaa2e24d8a09ee5f24b29a3ffa055e0b5eef66696c544b8117fe330b2b6289b4cdc9e0fddf5a056db197631850c2bdbf0e5bf8ad58b22ba17d44232f536efe37cc0ba7befec8ea0bbc8d1155023eed2388c53e3eb8fed353990829136432c4a0498aa683f9de807a0c6fbe1ea672e50618fb40999725cad4496314bb32297d1e904ec41fddcffbaf2a0f9eb816dc25794d5c39e48842cd6f3c45935d7b58842af0dc32ff6a4aee76a8ba01a914bde36e70ea592d4e5d170580a90fd55f88eabeadc1e233f2bd45f317ccca0864807d69c4d6fd05f79f592cb3fb9a17f3b4f0a84d708bd683576232e44cf01a0263d171a75ed30557830659df167f0837c8c4c3e2b8ceb798b30177582b4004ea09a66d15fe53c7ec229627ee86a9c0c94ca48f262de5e2dcd0c865e27eea3b908a00878a80cd9731ca42a811967a69b3f8169d3493d93cd012b7f7189a9369d0ce2a01b51167a29d469dafc9f69cc0a5d635580d2e4adbc6971aff5631c1ab861e6c0a000636acbf3135e7d8cd82af8950fcd92eb1151a0cd01173cf72a314dcc23e29180',
					'0xf90211a04c1c50de914e7e661cecfea797a9712128ff000886825b53038e3f258341514ca0680052e14d4aebd5a40297f92c80679c8b5e8e4e865fb668ad9e7365bd159befa0b162d1bfd9be32c724dc991cb3b08a6953ed4ffb23d5d2b69b9739250638212da02126cdcccd6bd541335ebc0a8ef8f699a40f90c438ec78b488723479bb3cafe7a0d3a747f2293740e97cbca8543efa2f0c7bab0de28485a96d52b477992fd549e9a0d354c24e608fbe96b12875c8d6dd24589c93ea1524e2a079b2931361a3352046a04019decc16f5f57b70521ab362e8136a2f5acc1ef9bf0ae1372c133980a9c5e7a0eca605b65a4db44fe55673ed54f6eede0d652343c67e64b917cff8a3bd3e543fa068a180505f7a51adb6ef58ae0a0e7d357ae7824d8f0a6d7879b2535d49f16733a022dd33aff9fb5cfab7c6869e273425e442d7b1d11aab79c25c548f7cac963712a062454ab4f04474bb4e97976cf3d6675eda49c36e9fd09e6d7b2f9622471a505ca0f75751fe93f607b66dc8605fca9f60fd33ddfd740273c9cf2a97e908a3de99a9a0459a3c77f258f284a7d29ce4857bf3ebb5e31bc7f5acfd0ab164c9d593f18794a092be6bc17390a58a1bc6894ee8bcdf6ee99d79039dce505a295d7ff3818b1963a00d622068900aa80f21a94bc2ec19f3f524a76e627c6cb9ae96b63e52e28f902ba08f714cf62e256c8a30dd46095e8ec3558d1490bba141195fabb36918531313ec80',
					'0xf90211a0a3744baf344a520aa1f4b04fc43bb443df6a53179099976a2d181c65de9501aea084f1a8dcf8e622df03d6c48a2a18a1096ed0d2121a11e82470927b6d972d7263a0f34592788176ebf77988048f952cf523ba8dcb7ed111eb669573c462f685f1f1a0326dbc60ce17e2fa2812353b63d227c8c3c6261761048badf773939617e466f6a0b4c39a874adf735ecec82110ad0e19564c9558b2e06fa78da4f4eb687864eac6a08797db9eca3d334c7e415424c8e8b0d075f1152fe1d956d0751b788369a06596a04fd34207086a538a0ae34fab90e0e8c70df6f0784ff703de70df8b231cf39c4ea07b9861c22eef80a2634e84856125bc191d02da9042ca7a36945aeba1bd5c1b7da0c87fe324fa196dbfbf180e01dc7c1479a8c49c46e488142605b859e98f59555ea0e9689b75d3499e8be47212d9dc702ee254b160e6d8e82fe60ee4c19e0f88ad2ba0b59105d7bd20c92dd9d1148613e223e072a361151775a4695f6f4cbd040cd6e8a0d8ce2dc72ff88f3acbf4fc9527b1c3c2723f996a3eb80321c5787eb511ddae31a0b3ac38a4ff8e9dd9d3d9d3a1a59332a6a4ba0a79a65afff858f1a6cbf82699aea0c1584add01851fcc0033b3049645d2768a68bf447a813c93f263af841d2d3fa0a0da14d366a634e2ce3b156ca8957ea808dbb99c65004cad3823f236f6545283f1a0b1f9d687067d9433dd00f7e91694a6db5990db73d017bc44037760318fa9a36180',
					'0xf901f1a04992c81fb7c2a4b738a0ec859a605175908d25b56f0eb2593a26fc8e435e471fa079b6e90459978f99a69409ffbb322b9786c4d86f454249a3e51e4dad9199a837a0826da9a0342abba983f1842dd0b0b9f6277394f9bfd942572900f3162bea07b7a0d697338cf762f079fbf49fa8190c527df0332ef6ef8b0b5b09c50645a3e9f467a0e4d3ff4fc0f96d53ab2dd7cdc84607c49cbc3922fa5bd81b647cf02873459807a018e2eed7e9941f5e82b65c8ae200bd0d02cf3b4cba05bff70d8e43aca68cf2d8a08a14ae3ff750400e88b4d81548d091e4ac88d6630f6e0f7725458a79c31d30d5a09534ee5da3538598c35e2110151511b4ea2e9b92f46152414504ad897f9b50d9a0b1201e6fc5bb4db20a66fdfbbcac796655b28c5f923133302ac3f56b2cf91041a0149aa97e47f15598d0ff0f4e45fbaf2829ea94126c4643c2fe15fccad32f5899a0387ab17c97edf208417b152125f5c95746b6b1ff96f10407dfd9f943d99651a3a03baa7861b45607cfb7a073e3c07467975a80e56b1a07fd25e7e96adbf115d1e8a00f1a754ca5facc4f992306041749e671525c4c271e88f8854f31efc381e75587a0cff8384434743845d5bf2388ee31038825e3cd963758c3982e9d0e9261e266f7a0ebd776dfc2458ede9c4f954fe306fb2e4d4f25c80996cf36eef63e550d99443f8080',
					'0xf85180808080808080a0aea5b54b4753e20156167a1ad8a4b9aa6d642012827f3b207f49fe0d9463725f80808080a0f6d02b1dbd6e8acc0e60675a55b79bf37d086b9c96977d0d95c205c2f51323a180808080',
					'0xe69e20cac85c956f3fe5b47d29bdd0020f90496bfcabacc562285f43b29079bc8685bba737b000',
				].map(rlpValue => ethers.utils.RLP.decode(rlpValue))),
			);
			console.log(`User has ${ethers.utils.formatEther(ethers.utils.RLP.decode(result))} DAI`);
		});

		it('Should RLP-encode a block response from geth', async () => {
			const rlp = getBlockHeaderAsRlp(gethBlockExample);
			expect(rlp).to.equal('0xf90234a0119f95d22a9d04d9af9f5c2fbf96f064ff9f3fe2e6b449f5b1445e0c23b93e16a01dcc4de8dec75d7aab85b567b6ccd41ad312451b948a7413f0a142fd40d49347941f9090aae28b8a3dceadf281b0f12828e676c326a01c3fe2f1f9278404a16f311de27e05659d8d682d9a5b88b68fc1ceb4fb385905a07e3f094c0d6d9c1ee866ddb080c483f7c9c6e027c027712208849de764ba40c5a0ebc546d4b4b661161504f4c125e5f62002c647ca487108e12825099af7c2e688b9010070e3494679c6738d76101a3380155f1900236909fdd301dc479b3011d5a04210623c0f4cf0182a52d252580c043701e20e1560018a807d030ad19602c83bec524110c42c44341d286d034a2e6ed83aec9498000684661a4567134564886c80d3562221063e55c0250645d590003c6fc5c61a38f942a45faa01a85510250e124a0f608350628c01187cc4d4d80b1365868552a1a581c400ade025384741f1043e17a0fd4a29b2e4365ab6eef6cc37168d344505367023abc140cda526118ac3f1151844c226550a2091830622acfad8bef9a92aae447fa8957c3244ab365bf18008b9e01a23460094286c24f1e90500908d2013125f30504085cd9813d4b1341b808401162c4a8401c9c38083e10023846514b953917273796e632d6275696c6465722e78797aa0644f658f52abd8e0e6e7086de4a4d004480d07f5e1d0bba19c102c43a0e135d888000000000000000085019ad6c763a05bcd64e38914ae12764dece2f72cc61343bb2aa7d235132054002cd5e8ff1a6c');
			expect(ethers.utils.keccak256(rlp)).to.equal(gethBlockExample.hash);
		});

		it('Should prove a complete storage proof', async () => {
			const {owner, verifier} = await deployProveth();
			const blockHeaderRlp = '0xf90234a0119f95d22a9d04d9af9f5c2fbf96f064ff9f3fe2e6b449f5b1445e0c23b93e16a01dcc4de8dec75d7aab85b567b6ccd41ad312451b948a7413f0a142fd40d49347941f9090aae28b8a3dceadf281b0f12828e676c326a01c3fe2f1f9278404a16f311de27e05659d8d682d9a5b88b68fc1ceb4fb385905a07e3f094c0d6d9c1ee866ddb080c483f7c9c6e027c027712208849de764ba40c5a0ebc546d4b4b661161504f4c125e5f62002c647ca487108e12825099af7c2e688b9010070e3494679c6738d76101a3380155f1900236909fdd301dc479b3011d5a04210623c0f4cf0182a52d252580c043701e20e1560018a807d030ad19602c83bec524110c42c44341d286d034a2e6ed83aec9498000684661a4567134564886c80d3562221063e55c0250645d590003c6fc5c61a38f942a45faa01a85510250e124a0f608350628c01187cc4d4d80b1365868552a1a581c400ade025384741f1043e17a0fd4a29b2e4365ab6eef6cc37168d344505367023abc140cda526118ac3f1151844c226550a2091830622acfad8bef9a92aae447fa8957c3244ab365bf18008b9e01a23460094286c24f1e90500908d2013125f30504085cd9813d4b1341b808401162c4a8401c9c38083e10023846514b953917273796e632d6275696c6465722e78797aa0644f658f52abd8e0e6e7086de4a4d004480d07f5e1d0bba19c102c43a0e135d888000000000000000085019ad6c763a05bcd64e38914ae12764dece2f72cc61343bb2aa7d235132054002cd5e8ff1a6c';
			const result = await verifier.validateStorageProof(
				'0x6ee02afbb250d694391688eda4b848cad1215c9e270fb242528b682fb424f657',
				[
					blockHeaderRlp,
					'0x6b175474e89094c44da98b954eedeac495271d0f',
					'0x1b78f95ce9c545113830f6f7eec96f49712a408da3b4b03d72d06260f909dc15',
					ethers.utils.RLP.encode([
						'0xf90211a095353f5048e3d69f67894ab6a382f67106f2c140fb52dc82e19929326e108c5aa0f5d72b7ce6aa3fcef03177e64b2f2c649615241723fd58901b681e4cb7faad2fa0f7c13b968e9f61971806f6516598ffcfb4a1fc75b2dcb076fce38cd724d68d29a00c51116cc4e3289c9f5fcaf3c7023d35a98b871c3ad5796b2152e23aa6f8d137a0578c5b639a884958aca80a4707f2a70a69d2423e8e83af6a6aa30ec21cd6b028a05c06188c61cafad08530618763ade222f674e4872770a8b619e5c0ea026aca95a05b2b0ff481567496d69c1189fef8476f575efb11da1d02c8a87a85f53e2269ffa04546323754b245a337e182ccff3ed4f635d5a38e4f85c35e7325cb0f0e9ff024a0212b298434fa43ed9f6817360bcc64017b744317132b6e9e91c86d6625177598a0f22e54731c577c403f65c2d8fd390ab82d29781745139d21def11c94e10967daa019e0eb6acaba728bf538d3dccf38549535785a8713e4577bca68f2ff1a5299c7a068afcc78625a0d9ec5bdadd93ec26f67a106477088a8d16eb253bcf5fb4af434a040fa962fc7544dd810eb2e4e19f28c5108323db5d7ad50886a1f1b80ef0dc874a04ef444652bd77142b66ce934675659f7f6aa4924e7a2a99b57f6cbb878702c45a0277a1a073d0ced481d0125e2cda0f81131a7e5cc56e0bf29c96a9eb894cbe0bea0ab0db8ab0310f9c3c35c76d554cbda1f14416eafe0b712e100b5f1c2ac1a60c180',
						'0xf90211a0a604ea9d20d4946274de5d2ea83305c63024cc4fd6fd37c47bd0461eb6d12d9aa0d1a84fef7f4617ba5f7c9e5d89922bc20f4245c58f2c2b55a24368771f8dd98aa06091660725527991406b0c199e92da75dbafca6cfc03506d035431f3019b706fa0c613767e080178c7d2fb904e72b9156cb57d73b4639fa1314238b35c47053edfa091f2953eaebdc5a56e6e6c80cff15d60d522460453d22d5a73d355f0cd019eefa0d9b77e366947bf74618c4788fa75df44ee8fefb134c2f2c2c8dee71f925fd896a05b74bdec19968af427cd2c5d2ee38d6884ea396374d7c0cf080af8d2fc236bcaa0c01e9e4f35a92a165b9ada355395ddbc5769956e515bcea320058ecde445575fa09de44fa77769fcb031daa81179a8d884c7ca3dd94d1daf519e69b8997144cbc0a0a8b278ed3f0e68efb17c277af11fdad7f0da13bd7446cfdec2b46a7876eef234a0d01868cbf2a528e74a2edf577b482107dbf2cedd2895eab39a6caa8b07bbab12a069c4847215206dc955d47224d1d37eb10c13400d541a4839d76637aee44534a9a05577989bfcaf875d8493075a9720d720dddda9758ee4253044ff10d81f99eda6a0e2ecd1a786ec861b0faaab948b0240b8cc860679a69730fe926e4fabb1a2cbada06113cb7a28b821625f2d7a2d9985a66d67592d4d59bf61276e2c201f94b2092fa04adc56500f444e7ec97774796816aad1354c00fe15530e4970b3108aad3ad03480',
						'0xf90211a0c6d2abe7a990f7ce3596db2e235b988a33330cf9507e5c783a90968a7ac381e5a0265a6219c2628374bcb15170f693ef250732109b8de490587812aeebe87f28bba082f2516624a8950a6902371a5a3291c93ec2a3c8d577e80259edff814383d7d3a09a15a6ec4dda216e565194cdc562ca3a687f77cf311942aa6102e51b00d2110fa0a3f83da16712c63a7fb4f46f6f08c39c41b2d1a4874d4a5117edaa860fb41bc0a067a1537310602d9b1a13d3f8f33c13a8b57dbdedbb0b606884314063c40177f6a023d50a233c6d696c802aa83e76fdd131714f5b7d009eca949e53796b22112c79a0f98b6e3a7caeefac754accd72b65a8b6edf093a80c145d723401277bb66af7c6a0690287f987c3ccf9451a131ecaa2cc80ae9176468596e1e17639d072a78059efa006992b44bb350527a9f616d4c2f3dcd4f981532cec3392b9409749894971caaaa0db90ed02a48f7413a71b9b0a314e5f0857857bab207b627fa13c784473062f85a023ec563f09aef0b0eed5cc41b717854d542a75278c35ced2a50c746bfa4b3356a01f7b29a01210c570d9948e5b11bd1ca100ce65a2b3aa0d4fbbfb62093028edb7a003cee9fb1ec7b517c5630bf35c5035c59280631c95dd458d15ade90bf66b1f1ea05ae15503bb1beefb35fdaf40d5665b2ac3bf9e4a890af498c7ac34f67b5b8d70a0eaaa94b86fe9dd5a70d2fa52f4d13c5a628617551fdfc5bbb6a3411667e1fb2780',
						'0xf90211a05f7e82110c6fe922193a381840d4ede7a6414d51d99def9eaf279692f1d391ffa05cb221e5eef8f7ede41b1f1349c1d5e3fd629f7ce3069c15baf1a5b817585cb0a0ba81b46ac16803f5c719e2024d01383f57185906400a17bb12af98283a75f11aa033e693efe89072f49ece85be082bd6f65fa30a74308175bab7fca25cd058083aa0325ee0518cdbb725cd48ef243650789c866fd5a7dd546d05f77e723361396026a0eb1dc0c67957f4a7caef2ebd13c41134ab3e57a6522fc049e9bee7e36ce379faa0f6d0946f8d1fc9638c71240649fabbd783265579e4564336577bf82d8b073823a00989bf22d9108d9c3cb97d4eda72cce20bef413b8ea1d4cbb1422ef7076b47c5a05d960cb1ebe679b559efacf7e052cb57aad13fc34b6b0b429dfbe35b719b3d05a01b3d2a4dfd23338a6ecbb3c471fd6463358a4cf485bccafd66c859f321ac780ea0b4a795d88dc9ed19a6392a83bc3d3649b3a8059fbc40b1e0856d9cb239befd08a0b5a41c2712a1c7f0b1af6c804009481b56b0a1a9c88de6412e9110888a3dee12a0b82fe0ac84aaea88d00589031f517a7fb2f7057e371206b992afc6b4a39e421aa0ff28d0f1dfb1f086fbd2650cb1835a59455f4d4ebb55f7cbb8301d556aaa6e1fa0e535e7ad69dacdcd58654f74c59b6521aa37b5b1f41be19662c4313092018374a0cf25374e071ae32cd010b620d1ff7987389fcc527e8624d8469ca44e1f12c4fd80',
						'0xf90211a0a98b824a5f0efc3a344830069e2c7176f316b39878cc69703470ed516b051c22a02f69cbf27944376ffbc6da8ec93dc7897d1afa96c35674dfc033a32387392342a047930812a6375e967e5d4d5cac54380f3278426d69cef0fe4142994b5ee991a4a0215497a5f7e8c0873c735d652c5944ddbfca9a938ac78de03cea4f9d70a40d09a097e439f7c1bb6bc89fbaa147b3865c6c6e73689537bc0e5dc5ed0ca9d6ec459da0872531d4130c8064ddd9fe3d0c6db27b67d07028ee4c72eaf77a8d88469460d3a0b9c735022279b01ff642c41a213f9284d870818e7424e6c2100db3ab8e2a9d8ba03f54f391947c1c44565ccacceb11b42b9682ef50aaeef85b3c30f189e755cf75a0f491a252d6d2d6550031fb2691f210841d1342e85c81dc6a07987a366845d31ca094bcc57bdb2b54d6d13b880f4d491a4200c1d7d2c498ac83dba5f5ce36ae681ca0af21fd0474cf3efa78da577ed5ad848454cc14886f536f39dbaa8466a03b6bd9a01c2b30714583edc4d2a20451554a35dd6832e09689eaa0d9853e6cc9ede8a761a090ab90274328ce68aa12525dc265ea4974a05e62533c89e31b926813250d5ec2a082d68ea741f52ee27849cb5fafe06b582bb01d40360f959c63320466f39ea7c1a078e5da31c43a84235b76e8144669b590f053a3713b2215ebacfeb9be8da4b89ba0b507e813c0c389da9167e4fecc7b165c4442ef6f77120d7ffd1e54acc971457f80',
						'0xf90211a0003ea8ed2c4613ba255373fd73c27c5a71e31b2c35f4b3fd232233dea76ba668a0d0ee9f6132ebfb7873b01e256f3697e6bb00948214adce11a49d6f401b505473a0a2f6327f840d13ea7bfdc20635a360a87feddccd9245d5118202c9783b289b7ea0f16cb9689dd861b806e7b50b16ecc4caebf50f322713f9d090a87cc3f5242aada05bfe1fe482493ebb85a3e98c0490959a44597a27a81339213772a131ece50976a0ebdc0ccd0119bbe3f3303f0ce413631338eb3261e5b2838015bca1e06f52783aa03ac22c87a7c755ddbbad4cf75350e11b281cbbf24b40e3a175d23482b7fd9890a0db5ab4ee47d864869220cff3b9df553c014db6b3e68bab36fb5e618aa62c6bcca045394f8f33d7593493affef7b87271aca2dd8447e1780271089b9b538e919a34a06484f72c89ba9e855a9e057eb907a63613dd3e3cfffd6c16020a119878802620a0bc171b1b45eeca31b49412c1daf2038844b3ee200bf616806dc3161a544e764aa0b8466c15227b85983863f9b8f2f27338f108e545600d9dba979a25a400249f8aa00a9133dd026f30bd7d3444b549fd934723b2e79ad87f3e3396a1c462da7e2e31a07de4230c5e56caa3aa757bd9816756ff5b26625fb00769738045310b003991f8a044ded66c5cbd696a72e218fb90ca7f216fe4b23bffd76aa16de40f52dfb4dabba04db089d8ba031877735be4196be3bd77087a8a512e0d32fa4980e05c94bf06a780',
						'0xf90171a07fd4e1844edfb807e1ab31804c256d615cf1baedac8ee3d82db39a79ebc40b41a0d7d633a58946d00ec7a1f93c1ca631df0a8673eae96370b6b72631a2907dfb77a020109805f7e2c937b8f329a424fecbb2a67ec3ccd55b48f7ead0dcca74c73d6480a0b40cabe387ab1ae0428e6acd4f45febed642e349e6ff78e5a0c05562312e524fa08ea99d2bb64a345ce2b71b68bca347bce6b8682a48398e889e78167d989067d5a0bc1535c370c9186a83f56114750fc37f2112cda85dfdde3b5e2cc276795e18ffa0cc80a46fd86aa7d5f4c2bc76f1e6fa171f6370a7220ad8b37ba5ecc254a992d7a06da6a64497a321688bf2df91fadc67562ad61132cff63169753fccb53ead595e80a004a55de72bdfbd5e0718f7f528c2f2659e8f5e28334dbdad66f08f601297800180a08f3d200f2b2ab128bba23649f57673f2d132ed1aadc4bd8e1f8ae866773fda9aa0aa7d188521de91c9d7605a4c7529e733f0a67d82f5fbab4c0a1435c8d4bd2afc808080',
						'0xf8669d338cfc997a82252167ac25a16580d9730353eb1b9f0c6bbf0e4c82c4d0b846f8440180a0210c77b5d616c75b1106ab99dfea0670395e26fe4e3f16194c3a77b79eeaf283a04e36f96ee1667a663dfaac57c4d185a0e369a3a217e0079d49620f34f85d1ac7',
					].map(rlpValue => ethers.utils.RLP.decode(rlpValue))),
					ethers.utils.RLP.encode([
						'0xf90211a0e1708e9ae46c09f48d1a357720b2598708a4a8828f76e2131db17d67d6c76407a0fc144ea47110100fee490c066d08ae164610d96f3f99549cded6a202999e6befa077baaa34645aefa585d51997db184372be9204d6990bb40462bcdedc2a51d21ca0184979cefb9e149eb9c639ada97c0a065d1e4035ed03131aa7945e06c31a3fbaa0c3edf55247a4bb0d0f43dc6787076997f2e87488854f6dbde168c96dea698c99a018a9566aaa49b4d064b68ca7122ee8cf1d365111e9235d285fcb634241d35317a00b53a04700434bfca5a679974952dae63bd12543ae953f445336932aba708462a011fd1c963383d12b89fac93bcd820e0486454d60e8fec85e13d59e5ef9d15810a05e7b3e9791c6bac9da7952e12ed9df04cbd2a3be2684ffdc97950800504281f9a042fe1097796a522f6afd5a262ab214a71264bd0786a4b95f1da74f431fb46123a0ac09a2db5e83b8a34b35cfd6c5288cce68129f45418b698c4fc3b53948357911a08e94cc8484130653984bc6035503a1719b2e882a11bd1441ac85e32148630ee6a09cb80f369f78116eb505337a5ea07d1ca3a31f17155f3bae1141109241d9aa5da0f849ff06e20a1617d749847e6b4cc424fc0b4bc69d6733c2afd5b2bee80c8613a0871c7e82e1888c6b162f4d632704349766f0fdae82add6a67e69134a9c36996aa0f6c6103d824953026feba409a0548a44098ae93cfe7689fde88119e42b669c5d80',
						'0xf90211a01da3c73865dcfc510dc8e169412504e6ad445ecb4e2c1adba207c0174790c757a0352c5cb95078cdb872dea09238b4cc9fe3aa8d50e70181c0bffcdae2b40b54f4a0ce995796573ea33aaa30b3fcbaa4fc89d89d86d13d972c65b62945e960c61603a09c017fbaade9f6a1ae510260cff77004862acff6711757b3b3a883beaa2e24d8a09ee5f24b29a3ffa055e0b5eef66696c544b8117fe330b2b6289b4cdc9e0fddf5a056db197631850c2bdbf0e5bf8ad58b22ba17d44232f536efe37cc0ba7befec8ea0bbc8d1155023eed2388c53e3eb8fed353990829136432c4a0498aa683f9de807a0c6fbe1ea672e50618fb40999725cad4496314bb32297d1e904ec41fddcffbaf2a0f9eb816dc25794d5c39e48842cd6f3c45935d7b58842af0dc32ff6a4aee76a8ba01a914bde36e70ea592d4e5d170580a90fd55f88eabeadc1e233f2bd45f317ccca0864807d69c4d6fd05f79f592cb3fb9a17f3b4f0a84d708bd683576232e44cf01a0263d171a75ed30557830659df167f0837c8c4c3e2b8ceb798b30177582b4004ea09a66d15fe53c7ec229627ee86a9c0c94ca48f262de5e2dcd0c865e27eea3b908a00878a80cd9731ca42a811967a69b3f8169d3493d93cd012b7f7189a9369d0ce2a01b51167a29d469dafc9f69cc0a5d635580d2e4adbc6971aff5631c1ab861e6c0a000636acbf3135e7d8cd82af8950fcd92eb1151a0cd01173cf72a314dcc23e29180',
						'0xf90211a04c1c50de914e7e661cecfea797a9712128ff000886825b53038e3f258341514ca0680052e14d4aebd5a40297f92c80679c8b5e8e4e865fb668ad9e7365bd159befa0b162d1bfd9be32c724dc991cb3b08a6953ed4ffb23d5d2b69b9739250638212da02126cdcccd6bd541335ebc0a8ef8f699a40f90c438ec78b488723479bb3cafe7a0d3a747f2293740e97cbca8543efa2f0c7bab0de28485a96d52b477992fd549e9a0d354c24e608fbe96b12875c8d6dd24589c93ea1524e2a079b2931361a3352046a04019decc16f5f57b70521ab362e8136a2f5acc1ef9bf0ae1372c133980a9c5e7a0eca605b65a4db44fe55673ed54f6eede0d652343c67e64b917cff8a3bd3e543fa068a180505f7a51adb6ef58ae0a0e7d357ae7824d8f0a6d7879b2535d49f16733a022dd33aff9fb5cfab7c6869e273425e442d7b1d11aab79c25c548f7cac963712a062454ab4f04474bb4e97976cf3d6675eda49c36e9fd09e6d7b2f9622471a505ca0f75751fe93f607b66dc8605fca9f60fd33ddfd740273c9cf2a97e908a3de99a9a0459a3c77f258f284a7d29ce4857bf3ebb5e31bc7f5acfd0ab164c9d593f18794a092be6bc17390a58a1bc6894ee8bcdf6ee99d79039dce505a295d7ff3818b1963a00d622068900aa80f21a94bc2ec19f3f524a76e627c6cb9ae96b63e52e28f902ba08f714cf62e256c8a30dd46095e8ec3558d1490bba141195fabb36918531313ec80',
						'0xf90211a0a3744baf344a520aa1f4b04fc43bb443df6a53179099976a2d181c65de9501aea084f1a8dcf8e622df03d6c48a2a18a1096ed0d2121a11e82470927b6d972d7263a0f34592788176ebf77988048f952cf523ba8dcb7ed111eb669573c462f685f1f1a0326dbc60ce17e2fa2812353b63d227c8c3c6261761048badf773939617e466f6a0b4c39a874adf735ecec82110ad0e19564c9558b2e06fa78da4f4eb687864eac6a08797db9eca3d334c7e415424c8e8b0d075f1152fe1d956d0751b788369a06596a04fd34207086a538a0ae34fab90e0e8c70df6f0784ff703de70df8b231cf39c4ea07b9861c22eef80a2634e84856125bc191d02da9042ca7a36945aeba1bd5c1b7da0c87fe324fa196dbfbf180e01dc7c1479a8c49c46e488142605b859e98f59555ea0e9689b75d3499e8be47212d9dc702ee254b160e6d8e82fe60ee4c19e0f88ad2ba0b59105d7bd20c92dd9d1148613e223e072a361151775a4695f6f4cbd040cd6e8a0d8ce2dc72ff88f3acbf4fc9527b1c3c2723f996a3eb80321c5787eb511ddae31a0b3ac38a4ff8e9dd9d3d9d3a1a59332a6a4ba0a79a65afff858f1a6cbf82699aea0c1584add01851fcc0033b3049645d2768a68bf447a813c93f263af841d2d3fa0a0da14d366a634e2ce3b156ca8957ea808dbb99c65004cad3823f236f6545283f1a0b1f9d687067d9433dd00f7e91694a6db5990db73d017bc44037760318fa9a36180',
						'0xf901f1a04992c81fb7c2a4b738a0ec859a605175908d25b56f0eb2593a26fc8e435e471fa079b6e90459978f99a69409ffbb322b9786c4d86f454249a3e51e4dad9199a837a0826da9a0342abba983f1842dd0b0b9f6277394f9bfd942572900f3162bea07b7a0d697338cf762f079fbf49fa8190c527df0332ef6ef8b0b5b09c50645a3e9f467a0e4d3ff4fc0f96d53ab2dd7cdc84607c49cbc3922fa5bd81b647cf02873459807a018e2eed7e9941f5e82b65c8ae200bd0d02cf3b4cba05bff70d8e43aca68cf2d8a08a14ae3ff750400e88b4d81548d091e4ac88d6630f6e0f7725458a79c31d30d5a09534ee5da3538598c35e2110151511b4ea2e9b92f46152414504ad897f9b50d9a0b1201e6fc5bb4db20a66fdfbbcac796655b28c5f923133302ac3f56b2cf91041a0149aa97e47f15598d0ff0f4e45fbaf2829ea94126c4643c2fe15fccad32f5899a0387ab17c97edf208417b152125f5c95746b6b1ff96f10407dfd9f943d99651a3a03baa7861b45607cfb7a073e3c07467975a80e56b1a07fd25e7e96adbf115d1e8a00f1a754ca5facc4f992306041749e671525c4c271e88f8854f31efc381e75587a0cff8384434743845d5bf2388ee31038825e3cd963758c3982e9d0e9261e266f7a0ebd776dfc2458ede9c4f954fe306fb2e4d4f25c80996cf36eef63e550d99443f8080',
						'0xf85180808080808080a0aea5b54b4753e20156167a1ad8a4b9aa6d642012827f3b207f49fe0d9463725f80808080a0f6d02b1dbd6e8acc0e60675a55b79bf37d086b9c96977d0d95c205c2f51323a180808080',
						'0xe69e20cac85c956f3fe5b47d29bdd0020f90496bfcabacc562285f43b29079bc8685bba737b000',
					].map(rlpValue => ethers.utils.RLP.decode(rlpValue))),
				],
			);
			expect(result).to.equal(ethers.BigNumber.from('0xbba737b000'));
			const blockNumber = ethers.BigNumber.from(ethers.utils.RLP.decode(blockHeaderRlp)[8]);
			console.log(`User has ${ethers.utils.formatEther(result)} DAI based on the state root from block ${blockNumber}`);
		});
	});
});
