export const flattenObject = function flattenObject(
	obj: Record<string, unknown>,
	prefix = ''
): Record<string, string> {
	const flattened: Record<string, string> = {};

	for (const [key, value] of Object.entries(obj)) {
		const newKey = prefix ? `${prefix}.${key}` : key;

		if (value === null || value === undefined) {
			flattened[newKey] = '';
		} else if (typeof value === 'boolean') {
			if (value) {
				flattened[newKey] = '1';
			}
		} else if (typeof value === 'object' && !Array.isArray(value)) {
			Object.assign(
				flattened,
				flattenObject(value as Record<string, unknown>, newKey)
			);
		} else {
			flattened[newKey] = String(value);
		}
	}

	return flattened;
};

export const unflattenObject = function unflattenObject(
	flattened: Record<string, string>
): Record<string, unknown> {
	const result: Record<string, unknown> = {};

	for (const [key, value] of Object.entries(flattened)) {
		const keys = key.split('.');

		if (keys.length === 0 || keys.includes('__proto__')) {
			continue;
		}

		let current: Record<string, unknown> = result;

		for (let i = 0; i < keys.length - 1; i += 1) {
			const k = keys[i];
			if (k === undefined) {
				continue;
			}
			const existing = Object.hasOwn(current, k) ? current[k] : undefined;
			if (
				typeof existing !== 'object' ||
				existing === null ||
				Array.isArray(existing)
			) {
				current[k] = {};
			}
			current = current[k] as Record<string, unknown>;
		}

		const lastKey = keys[keys.length - 1];

		if (lastKey === undefined) {
			continue;
		}

		if (value === '1') {
			current[lastKey] = true;
		} else if (value === '0') {
			current[lastKey] = false;
		} else if (value === '') {
			current[lastKey] = null;
		} else if (!Number.isNaN(Number(value)) && value !== '') {
			current[lastKey] = Number(value);
		} else {
			current[lastKey] = value;
		}
	}

	return result;
};

export const flatToString = function flatToString(
	flattened: Record<string, string>
): string {
	return Object.entries(flattened)
		.map(([key, value]) => `${key}:${value}`)
		.join(',');
};

export const stringToFlat = function stringToFlat(
	str: string
): Record<string, string> {
	if (!str) {
		return {};
	}

	const result: Record<string, string> = {};
	const pairs = str.split(',');

	for (const pair of pairs) {
		const colonIndex = pair.indexOf(':');
		if (colonIndex === -1) {
			continue;
		}

		const key = pair.substring(0, colonIndex);
		const value = pair.substring(colonIndex + 1);
		result[key] = value;
	}

	return result;
};
