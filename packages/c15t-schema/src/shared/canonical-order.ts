const ASCII_ORDER =
	' _-,;:!?.\'"()[]{}@*/\\&#%`^+<=>|~$0123456789abcdefghijklmnopqrstuvwxyz';

const FIRST_PRINTABLE = 0x20;
const LAST_PRINTABLE = 0x7e;
const UPPER_A = 0x41;
const UPPER_Z = 0x5a;
const CASE_OFFSET = 0x20;

const PRIMARY = new Int8Array(LAST_PRINTABLE + 1).fill(-1);
for (let index = 0; index < ASCII_ORDER.length; index += 1) {
	const code = ASCII_ORDER.charCodeAt(index);
	PRIMARY[code] = index;
	if (code >= UPPER_A + CASE_OFFSET && code <= UPPER_Z + CASE_OFFSET) {
		PRIMARY[code - CASE_OFFSET] = index;
	}
}

const isPrintable = function isPrintable(code: number): boolean {
	return code >= FIRST_PRINTABLE && code <= LAST_PRINTABLE;
};

const isUppercase = function isUppercase(code: number): boolean {
	return code >= UPPER_A && code <= UPPER_Z;
};

const hasNonPrintable = function hasNonPrintable(
	value: string,
	from: number
): boolean {
	for (let index = from; index < value.length; index += 1) {
		if (!isPrintable(value.charCodeAt(index))) {
			return true;
		}
	}
	return false;
};

const collate = function collate(left: string, right: string): number {
	return left.localeCompare(right, 'en');
};

export const compareCanonical = function compareCanonical(
	left: string,
	right: string
): number {
	const shared = Math.min(left.length, right.length);
	let caseDifference = 0;
	for (let index = 0; index < shared; index += 1) {
		const leftCode = left.charCodeAt(index);
		const rightCode = right.charCodeAt(index);
		if (!(isPrintable(leftCode) && isPrintable(rightCode))) {
			return collate(left, right);
		}
		if (leftCode !== rightCode) {
			const difference =
				(PRIMARY[leftCode] as number) - (PRIMARY[rightCode] as number);
			if (difference !== 0) {
				return difference;
			}
			if (caseDifference === 0) {
				caseDifference = isUppercase(leftCode) ? 1 : -1;
			}
		}
	}
	if (hasNonPrintable(left, shared) || hasNonPrintable(right, shared)) {
		return collate(left, right);
	}
	if (left.length !== right.length) {
		return left.length - right.length;
	}
	return caseDifference;
};
