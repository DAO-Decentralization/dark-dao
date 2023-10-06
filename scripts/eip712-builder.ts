import {ethers} from 'ethers';
import {type BigNumberish, type HexLike} from 'ethers';
import {type TypedDataDomain, type TypedDataField} from '@ethersproject/abstract-signer';

type EIP712Domain = {
	name?: string;
	version?: string;
	chainId?: BigNumberish;
	verifyingContract?: string;
	salt?: HexLike;
};

type EIP712DomainParameters = EIP712Domain & {usedParamsMask: number};

export type PopulatedTypedData = {
	domain: TypedDataDomain;
	types: Record<string, TypedDataField[]>;
	primaryType: string;
	message: Record<string, any>;
};

export function getDomainParams(domain: EIP712Domain): EIP712DomainParameters {
	const domainParameters: EIP712DomainParameters = {...domain, usedParamsMask: 0};
	const domainParameterNames = ['name', 'version', 'chainId', 'verifyingContract', 'salt'];
	const domainParameterDefaults = ['', '', 0, '0x0000000000000000000000000000000000000000', '0x0000000000000000000000000000000000000000000000000000000000000000'];
	for (const [i, domainParameterName] of domainParameterNames.entries()) {
		if (Object.keys(domain).includes(domainParameterName)) {
			domainParameters.usedParamsMask |= (1 << i);
		} else {
			domainParameters[domainParameterName] = domainParameterDefaults[i];
		}
	}

	return domainParameters;
}

export function getTypedDataParams(typedData: PopulatedTypedData): {typeString: string; encodedData: string; domainParams: EIP712DomainParameters} {
	const typedDataEnc = ethers.utils._TypedDataEncoder.from(typedData.types);
	const typeString = typedDataEnc.encodeType(typedData.primaryType);
	const encodedData = ethers.utils.hexDataSlice(typedDataEnc.encodeData(typedData.primaryType, typedData.message), 32);
	const domainParameters = getDomainParams(typedData.domain);
	return {
		typeString,
		encodedData,
		domainParams: domainParameters,
	};
}
