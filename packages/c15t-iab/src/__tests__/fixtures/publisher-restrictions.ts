const BASE64URL =
	'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

const HEADER_BITS = 213;

export type RestrictionEntry = number | readonly [number, number];

export interface WireRestriction {
	purposeId: number;
	restrictionType: number;
	entries: readonly RestrictionEntry[];
}

export interface CoreSegmentFixture {
	cmpId?: number;
	created?: Date;
	isServiceSpecific?: boolean;
	policyVersion?: number;
	purposeConsents?: readonly number[];
	purposeLegitimateInterests?: readonly number[];
	restrictions: readonly WireRestriction[];
	vendorConsents?: readonly number[];
	vendorLegitimateInterests?: readonly number[];
	vendorListVersion?: number;
}

const int = (value: number, bits: number): string => {
	if (!Number.isInteger(value) || value < 0 || value >= 2 ** bits) {
		throw new RangeError(`${value} does not fit in ${bits} bits`);
	}
	return value.toString(2).padStart(bits, '0');
};

const bitfield = (ids: readonly number[], length: number): string => {
	let bits = '';
	for (let id = 1; id <= length; id += 1) {
		bits += ids.includes(id) ? '1' : '0';
	}
	return bits;
};

const letters = (code: string): string =>
	int(code.charCodeAt(0) - 65, 6) + int(code.charCodeAt(1) - 65, 6);

const vendorSection = (ids: readonly number[]): string => {
	const maxVendorId = ids.length ? Math.max(...ids) : 0;
	return `${int(maxVendorId, 16)}0${bitfield(ids, maxVendorId)}`;
};

const toBase64Url = (bits: string): string => {
	const padding = bits.length % 24;
	const padded = padding ? bits + '0'.repeat(24 - padding) : bits;
	let result = '';
	for (let index = 0; index < padded.length; index += 6) {
		result += BASE64URL[Number.parseInt(padded.slice(index, index + 6), 2)];
	}
	return result;
};

const fromBase64Url = (value: string): string => {
	let bits = '';
	for (const character of value) {
		const index = BASE64URL.indexOf(character);
		if (index < 0) {
			throw new RangeError(`Invalid base64url character ${character}`);
		}
		bits += int(index, 6);
	}
	return bits;
};

export const encodeCoreSegment = function encodeCoreSegment(
	fixture: CoreSegmentFixture
): string {
	const created = Math.round(
		(fixture.created ?? new Date(Date.UTC(2026, 0, 15))).getTime() / 100
	);
	let bits =
		int(2, 6) +
		int(created, 36) +
		int(created, 36) +
		int(fixture.cmpId ?? 28, 12) +
		int(1, 12) +
		int(1, 6) +
		letters('EN') +
		int(fixture.vendorListVersion ?? 142, 12) +
		int(fixture.policyVersion ?? 5, 6) +
		int(fixture.isServiceSpecific === false ? 0 : 1, 1) +
		int(0, 1) +
		int(0, 12) +
		bitfield(fixture.purposeConsents ?? [], 24) +
		bitfield(fixture.purposeLegitimateInterests ?? [], 24) +
		int(0, 1) +
		letters('US');
	bits += vendorSection(fixture.vendorConsents ?? []);
	bits += vendorSection(fixture.vendorLegitimateInterests ?? []);
	bits += int(fixture.restrictions.length, 12);
	for (const restriction of fixture.restrictions) {
		bits += int(restriction.purposeId, 6);
		bits += int(restriction.restrictionType, 2);
		bits += int(restriction.entries.length, 12);
		for (const entry of restriction.entries) {
			if (typeof entry === 'number') {
				bits += `0${int(entry, 16)}`;
			} else {
				bits += `1${int(entry[0], 16)}${int(entry[1], 16)}`;
			}
		}
	}
	return toBase64Url(bits);
};

export const readWireRestrictions = function readWireRestrictions(
	tcString: string
): WireRestriction[] {
	const bits = fromBase64Url(tcString.split('.')[0] ?? '');
	let index = HEADER_BITS;
	const read = (length: number): number => {
		const value = Number.parseInt(bits.slice(index, index + length), 2);
		index += length;
		return value;
	};
	const skipVendorSection = () => {
		const maxVendorId = read(16);
		if (read(1) === 0) {
			index += maxVendorId;
			return;
		}
		const entries = read(12);
		for (let entry = 0; entry < entries; entry += 1) {
			index += read(1) === 1 ? 32 : 16;
		}
	};
	skipVendorSection();
	skipVendorSection();
	const restrictions: WireRestriction[] = [];
	const count = read(12);
	for (let group = 0; group < count; group += 1) {
		const purposeId = read(6);
		const restrictionType = read(2);
		const entryCount = read(12);
		const entries: RestrictionEntry[] = [];
		for (let entry = 0; entry < entryCount; entry += 1) {
			const isRange = read(1) === 1;
			const start = read(16);
			entries.push(isRange ? [start, read(16)] : start);
		}
		restrictions.push({ entries, purposeId, restrictionType });
	}
	return restrictions;
};

export const PURPOSE_PROHIBITED_TC_STRING = encodeCoreSegment({
	purposeConsents: [1, 2, 7],
	purposeLegitimateInterests: [7, 9],
	restrictions: [{ entries: [1, [10, 12]], purposeId: 2, restrictionType: 0 }],
	vendorConsents: [1, 2, 10],
	vendorLegitimateInterests: [1, 10],
});

export const CONSENT_REQUIRED_TC_STRING = encodeCoreSegment({
	purposeConsents: [1, 7],
	purposeLegitimateInterests: [7],
	restrictions: [{ entries: [1], purposeId: 7, restrictionType: 1 }],
	vendorConsents: [1],
	vendorLegitimateInterests: [1],
});

export const LEGITIMATE_INTEREST_REQUIRED_TC_STRING = encodeCoreSegment({
	purposeConsents: [1, 2],
	purposeLegitimateInterests: [2],
	restrictions: [{ entries: [755], purposeId: 2, restrictionType: 2 }],
	vendorConsents: [755],
	vendorLegitimateInterests: [755],
});

export const UNDEFINED_RESTRICTION_TC_STRING = encodeCoreSegment({
	restrictions: [{ entries: [1], purposeId: 2, restrictionType: 3 }],
});

export const PURPOSE_ZERO_RESTRICTION_TC_STRING = encodeCoreSegment({
	restrictions: [{ entries: [1], purposeId: 0, restrictionType: 0 }],
});

export const INVERTED_RANGE_RESTRICTION_TC_STRING = encodeCoreSegment({
	restrictions: [{ entries: [[12, 10]], purposeId: 2, restrictionType: 0 }],
});

export const VENDOR_ZERO_RESTRICTION_TC_STRING = encodeCoreSegment({
	restrictions: [{ entries: [0], purposeId: 2, restrictionType: 0 }],
});

export const LI_ON_CONSENT_ONLY_PURPOSE_TC_STRING = encodeCoreSegment({
	restrictions: [{ entries: [1], purposeId: 3, restrictionType: 2 }],
});

export const GLOBAL_SCOPE_RESTRICTION_TC_STRING = encodeCoreSegment({
	isServiceSpecific: false,
	restrictions: [{ entries: [1], purposeId: 2, restrictionType: 0 }],
});

export const POLICY_2_LI_ON_PURPOSE_3_TC_STRING = encodeCoreSegment({
	policyVersion: 2,
	restrictions: [{ entries: [1], purposeId: 3, restrictionType: 2 }],
});

export const POLICY_2_LI_ON_PURPOSE_1_TC_STRING = encodeCoreSegment({
	policyVersion: 2,
	restrictions: [{ entries: [1], purposeId: 1, restrictionType: 2 }],
});

export const CONFLICTING_RESTRICTIONS_TC_STRING = encodeCoreSegment({
	restrictions: [
		{ entries: [1], purposeId: 2, restrictionType: 1 },
		{ entries: [1], purposeId: 2, restrictionType: 2 },
	],
});
