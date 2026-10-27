const DEFAULT_IP_HEADERS = [
	'x-client-ip',
	'x-forwarded-for',
	'cf-connecting-ip',
	'fastly-client-ip',
	'x-real-ip',
	'x-cluster-client-ip',
	'x-forwarded',
	'forwarded-for',
	'forwarded',
];

const expandIPv6 = function expandIPv6(ip: string): string {
	if (ip.includes('.')) {
		return ip;
	}

	const parts = ip.split(':');
	const emptyIndex = parts.indexOf('');

	if (emptyIndex !== -1) {
		const nonEmptyParts = parts.filter((p) => p !== '');
		const missingGroups = 8 - nonEmptyParts.length;
		const zeros = Array(missingGroups).fill('0000');

		if (emptyIndex === 0) {
			parts.shift();
			if (parts[0] === '') {
				parts.shift();
			}
			parts.unshift(...zeros);
		}
		else if (emptyIndex === parts.length - 1) {
			parts.pop();
			if (parts[parts.length - 1] === '') {
				parts.pop();
			}
			parts.push(...zeros);
		}
		else {
			parts.splice(emptyIndex, 1, ...zeros);
		}
	}

	return parts.map((p) => p.padStart(4, '0')).join(':');
};

const compressIPv6 = function compressIPv6(ip: string): string {
	const groups = ip.split(':').map((g) => g.replace(/^0+/u, '') || '0');

	let longestStart = -1;
	let longestLength = 0;
	let currentStart = -1;
	let currentLength = 0;

	for (let i = 0; i < groups.length; i += 1) {
		if (groups[i] === '0') {
			if (currentStart === -1) {
				currentStart = i;
				currentLength = 1;
			} else {
				currentLength += 1;
			}
		} else {
			if (currentLength > longestLength) {
				longestStart = currentStart;
				longestLength = currentLength;
			}
			currentStart = -1;
			currentLength = 0;
		}
	}

	if (currentLength > longestLength) {
		longestStart = currentStart;
		longestLength = currentLength;
	}

	if (longestLength > 1) {
		const before = groups.slice(0, longestStart);
		const after = groups.slice(longestStart + longestLength);

		if (before.length === 0 && after.length === 0) {
			return '::';
		}
		if (before.length === 0) {
			return `::${after.join(':')}`;
		}
		if (after.length === 0) {
			return `${before.join(':')}::`;
		}
		return `${before.join(':')}::${after.join(':')}`;
	}

	return groups.join(':');
};

export const maskIpAddress = function maskIpAddress(
	ip: string | null
): string | null {
	if (!ip) {
		return null;
	}

	if (ip.includes('.') && !ip.includes(':')) {
		const parts = ip.split('.');
		if (parts.length === 4) {
			parts[3] = '0';
			return parts.join('.');
		}
		return ip;
	}

	if (ip.includes(':')) {
		if (ip.includes('.')) {
			const lastColon = ip.lastIndexOf(':');
			const ipv4Part = ip.substring(lastColon + 1);
			const ipv6Prefix = ip.substring(0, lastColon + 1);

			const ipv4Parts = ipv4Part.split('.');
			if (ipv4Parts.length === 4) {
				ipv4Parts[3] = '0';
				return ipv6Prefix + ipv4Parts.join('.');
			}
			return ip;
		}

		const expanded = expandIPv6(ip);
		const groups = expanded.split(':');

		for (let i = 3; i < 8; i += 1) {
			groups[i] = '0000';
		}

		return compressIPv6(groups.join(':'));
	}

	return ip;
};

export const DEFAULT_IP_HEADERS_LIST: readonly string[] = DEFAULT_IP_HEADERS;

export interface IpAddressConfig {
	readonly tracking?: boolean;
	readonly masking?: boolean;
	readonly ipAddressHeaders?: readonly string[];
}

export const getIpAddress = function getIpAddress(
	source: Request | Headers,
	config?: IpAddressConfig
): string | null {
	if (config?.tracking === false) {
		return null;
	}

	const ipHeaders = config?.ipAddressHeaders ?? DEFAULT_IP_HEADERS;
	const headers = source instanceof Request ? source.headers : source;

	for (const key of ipHeaders) {
		const value = headers.get(key);
		if (!value) {
			continue;
		}
		const ip = value.split(',')[0]?.trim();
		if (!ip) {
			continue;
		}
		return config?.masking === false ? ip : maskIpAddress(ip);
	}

	return null;
};
