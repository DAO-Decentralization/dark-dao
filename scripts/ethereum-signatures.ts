import * as ethers from 'ethers';

export function createEthereumMessage(message: string): string {
	const messageEth = '\u0019Ethereum Signed Message:\n' + message.length + message;
	const messageEthBytes = '0x' + messageEth.split('')
		.map(c => c.charCodeAt(0).toString(16).padStart(2, '0'))
		.join('');
	return messageEthBytes;
}

// Convert a Sapphire DER-encoded signature to an Ethereum signature
export function derToEthSignature(signature: string, messageOrDigest: string, expectedAddress: string, isMessage = false): string | undefined {
	// DER-encoded sequence with correct length
	let pos = 0;
	if (ethers.utils.hexDataSlice(signature, pos, pos + 1) !== '0x30') {
		throw new Error('Expected DER sequence');
	}

	pos++;
	if (ethers.utils.hexDataSlice(signature, pos, pos + 1) !== ethers.utils.hexlify([ethers.utils.hexDataLength(signature) - 2])) {
		throw new Error('Incorrect DER element length');
	}

	pos++;

	// Parse signature
	const pieces = [];
	for (let i = 0; i < 2; i++) {
		if (ethers.utils.hexDataSlice(signature, pos, pos + 1) !== '0x02') {
			throw new Error('Expected DER integer');
		}

		pos++;
		const length = ethers.utils.arrayify(ethers.utils.hexDataSlice(signature, pos, pos + 1))[0];
		pos++;
		let piece = ethers.utils.hexDataSlice(signature, pos, pos + length);
		pos += length;
		if (length === 33) {
			// Trim extra zero byte
			if (ethers.utils.hexDataSlice(piece, 0, 1) !== '0x00') {
				throw new Error('Expected to trim an extra zero byte');
			}

			piece = ethers.utils.hexDataSlice(piece, 1, 33);
		}

		if (ethers.utils.hexDataLength(piece) !== 32) {
			throw new Error('Piece length is ' + ethers.utils.hexDataLength(piece) + ', expected 32');
		}

		pieces.push(piece);
	}

	let ethSig = undefined;
	for (let i = 0; i < 2; i++) {
		const potentialSignature = ethers.utils.hexConcat([...pieces, ethers.utils.hexlify(0x1B + i)]);
		try {
			if (isMessage) {
				if (ethers.utils.verifyMessage(messageOrDigest, potentialSignature) === expectedAddress) {
					ethSig = potentialSignature;
				}
			} else {
				console.log('Trying to recover digest ' + messageOrDigest + ' with signature ' + potentialSignature);
				const publicKey = ethers.utils.recoverPublicKey(messageOrDigest, potentialSignature);
				const address = ethers.utils.computeAddress(publicKey);
				if (address === expectedAddress) {
					ethSig = potentialSignature;
					break;
				}
			}
		} catch (error) {
			console.warn('Skipped an error:', error);
		}
	}

	return ethSig;
}
