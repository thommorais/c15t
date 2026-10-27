const BASE58_ALPHABET =
	'123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

const base58Encode = function base58Encode(
	bytes: Uint8Array,
	view: DataView
): string {
	let num = BigInt(0);
	for (let offset = 0; offset < bytes.length; offset += 4) {
		num = num * BigInt(2 ** 32) + BigInt(view.getUint32(offset, false));
	}

	const groupBase = BigInt(58 ** 5);
	let encoded = '';
	while (num > BigInt(0)) {
		let group = Number(num % groupBase);
		num /= groupBase;
		let digits = '';
		for (let index = 0; index < 5; index += 1) {
			digits = BASE58_ALPHABET.charAt(group % 58) + digits;
			group = Math.floor(group / 58);
			if (num === BigInt(0) && group === 0) {
				break;
			}
		}
		encoded = digits + encoded;
	}

	for (const byte of bytes) {
		if (byte !== 0) {
			break;
		}
		encoded = BASE58_ALPHABET.charAt(0) + encoded;
	}
	return encoded || BASE58_ALPHABET.charAt(0);
};

const EPOCH_TIMESTAMP = 1_700_000_000_000;

export const generateSubjectId = function generateSubjectId(): string {
	const buf = crypto.getRandomValues(new Uint8Array(20));

	const t = Date.now() - EPOCH_TIMESTAMP;

	const view = new DataView(buf.buffer);
	view.setUint32(0, Math.floor(t / 2 ** 32), false);
	view.setUint32(4, t % 2 ** 32, false);

	return `sub_${base58Encode(buf, view)}`;
};

export const isValidSubjectId = function isValidSubjectId(id: string): boolean {
	if (!id.startsWith('sub_')) {
		return false;
	}

	const encoded = id.slice(4);

	if (encoded.length === 0) {
		return false;
	}

	for (const char of encoded) {
		if (!BASE58_ALPHABET.includes(char)) {
			return false;
		}
	}

	return true;
};
