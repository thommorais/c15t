export const MIN_CMP_ID = 2;

export const MAX_CMP_ID = 4_095;

export const isValidCmpId = function isValidCmpId(
	value: unknown
): value is number {
	return (
		typeof value === 'number' &&
		Number.isInteger(value) &&
		value >= MIN_CMP_ID &&
		value <= MAX_CMP_ID
	);
};

export const createCmpIdError = function createCmpIdError(
	value: unknown
): Error {
	const received =
		value === undefined ? 'undefined (no cmpId was provided)' : String(value);
	return new Error(
		`@c15t/iab needs a CMP ID registered with IAB Europe: an integer from ${MIN_CMP_ID} to ${MAX_CMP_ID}. ` +
			`A TC String cannot be encoded without one, so no consent record is written. ` +
			`Register at https://register.consensu.org/CMP, or omit cmpId and let the backend ` +
			`return it from /init. Received: ${received}.`
	);
};

export const assertValidCmpId = function assertValidCmpId(
	value: unknown
): number {
	if (!isValidCmpId(value)) {
		throw createCmpIdError(value);
	}
	return value;
};
