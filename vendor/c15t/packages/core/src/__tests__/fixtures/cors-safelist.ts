const SIMPLE_METHODS = new Set(['GET', 'HEAD', 'POST']);

const hasUnsafeByte = (value: string): boolean =>
	[...value].some((char) => {
		const code = char.charCodeAt(0);
		return (
			(code < 0x20 && code !== 0x09) ||
			code === 0x7f ||
			'"():<>?@[\\]{}'.includes(char)
		);
	});

const LANGUAGE_VALUE = /^[\d A-Za-z*,\-.;=]*$/u;

const SIMPLE_CONTENT_TYPES = new Set([
	'application/x-www-form-urlencoded',
	'multipart/form-data',
	'text/plain',
]);

const isSafelisted = (name: string, value: string): boolean => {
	if (value.length > 128) {
		return false;
	}
	switch (name) {
		case 'accept':
			return !hasUnsafeByte(value);
		case 'accept-language':
		case 'content-language':
			return LANGUAGE_VALUE.test(value);
		case 'content-type': {
			const essence = value.split(';')[0]?.trim().toLowerCase() ?? '';
			return !hasUnsafeByte(value) && SIMPLE_CONTENT_TYPES.has(essence);
		}
		case 'range':
			return /^bytes=\d+-\d*$/u.test(value);
		default:
			return false;
	}
};

const toEntries = (headers: HeadersInit | undefined): [string, string][] => {
	if (!headers) {
		return [];
	}
	if (headers instanceof Headers) {
		return [...headers.entries()];
	}
	if (Array.isArray(headers)) {
		return headers.map(([name, value]) => [name ?? '', value ?? '']);
	}
	return Object.entries(headers);
};

export const corsPreflightReasons = function corsPreflightReasons(
	init: RequestInit | undefined
): string[] {
	const reasons: string[] = [];
	const method = (init?.method ?? 'GET').toUpperCase();
	if (!SIMPLE_METHODS.has(method)) {
		reasons.push(`method ${method}`);
	}
	let total = 0;
	for (const [rawName, value] of toEntries(init?.headers)) {
		const name = rawName.toLowerCase();
		if (isSafelisted(name, value)) {
			total += value.length;
		} else {
			reasons.push(`header ${name}: ${value}`);
		}
	}
	if (total > 1024) {
		reasons.push(`safelisted header values total ${total} bytes`);
	}
	return reasons;
};
