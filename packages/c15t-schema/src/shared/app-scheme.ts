const WEB_SCHEMES = new Set(['http:', 'https:', 'ws:', 'wss:']);

const SCHEME_REGEX = /^(?<scheme>[a-z][a-z\d+.-]*):\/\//iu;

export const getAppScheme = function getAppScheme(
	value: string
): string | undefined {
	const match = SCHEME_REGEX.exec(value.trim());
	const scheme = match?.groups?.scheme;
	if (!scheme) {
		return undefined;
	}

	const normalized = `${scheme.toLowerCase()}:`;
	return WEB_SCHEMES.has(normalized) ? undefined : normalized;
};
