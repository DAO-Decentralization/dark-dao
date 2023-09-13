import {type BigNumberish, type HexLike} from 'ethers';

type EIP712Domain = {
	name?: string;
	version?: string;
	chainId?: BigNumberish;
	verifyingContract?: string;
	salt?: HexLike;
};

type EIP712DomainParameters = EIP712Domain & {usedParamsMask: number};

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
