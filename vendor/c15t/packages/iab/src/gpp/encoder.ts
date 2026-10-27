import {
	GPC_SUBSECTION,
	GPC_SUBSECTION_TYPE,
	GPP_HEADER_ID,
	GPP_HEADER_VERSION,
} from './sections';
import type { GPPFieldSpec, USSectionDefinition } from './sections';

export type GPPFieldValues = Record<string, number | boolean | number[]>;

const BASE64_URL =
	'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

const fixedInteger = function fixedInteger(
	value: number,
	bits: number
): string {
	if (!Number.isInteger(value) || value < 0 || value >= 2 ** bits) {
		throw new RangeError(`GPP: ${value} does not fit in ${bits} bits.`);
	}
	return value.toString(2).padStart(bits, '0');
};

const fibonacciInteger = function fibonacciInteger(value: number): string {
	const sequence = [1, 2];
	while (
		(sequence.at(-1) ?? 0) + (sequence.at(-2) ?? 0) <= value &&
		sequence.length < 64
	) {
		sequence.push((sequence.at(-1) ?? 0) + (sequence.at(-2) ?? 0));
	}
	let remaining = value;
	const digits: string[] = [];
	for (let index = sequence.length - 1; index >= 0; index -= 1) {
		const term = sequence[index] ?? 0;
		if (term <= remaining) {
			digits[index] = '1';
			remaining -= term;
		} else {
			digits[index] = '0';
		}
	}
	return `${digits.join('').replace(/0+$/u, '')}1`;
};

export const fibonacciRange = function fibonacciRange(
	values: readonly number[]
): string {
	const sorted = [...new Set(values)].sort((left, right) => left - right);
	const groups: number[][] = [];
	for (const value of sorted) {
		const group = groups.at(-1);
		if (group && group.at(-1) === value - 1) {
			group.push(value);
		} else {
			groups.push([value]);
		}
	}
	let offset = 0;
	let bits = fixedInteger(groups.length, 12);
	for (const group of groups) {
		const first = group[0] ?? 0;
		const last = group.at(-1) ?? first;
		if (group.length === 1) {
			bits += `0${fibonacciInteger(first - offset)}`;
		} else {
			bits += `1${fibonacciInteger(first - offset)}${fibonacciInteger(last - first)}`;
		}
		offset = last;
	}
	return bits;
};

export const compressedBase64Url = function compressedBase64Url(
	bits: string
): string {
	let padded = bits.padEnd(Math.ceil(bits.length / 8) * 8, '0');
	padded = padded.padEnd(Math.ceil(padded.length / 6) * 6, '0');
	let encoded = '';
	for (let index = 0; index < padded.length; index += 6) {
		encoded += BASE64_URL.charAt(
			Number.parseInt(padded.slice(index, index + 6), 2)
		);
	}
	return encoded;
};

const encodeField = function encodeField(
	[name, bits, count]: GPPFieldSpec,
	values: GPPFieldValues
): string {
	const value = values[name];
	if (count === undefined) {
		return fixedInteger(Number(value ?? 0), bits);
	}
	const entries = Array.isArray(value) ? value : [];
	if (entries.length !== count) {
		throw new RangeError(`GPP: ${name} needs ${count} entries.`);
	}
	return entries.map((entry) => fixedInteger(entry, bits)).join('');
};

const encodeSubsection = function encodeSubsection(
	fields: readonly GPPFieldSpec[],
	values: GPPFieldValues
): string {
	return compressedBase64Url(
		fields.map((field) => encodeField(field, values)).join('')
	);
};

export interface USSectionValues {
	core: GPPFieldValues;
	gpc: boolean;
}

export const encodeUSSection = function encodeUSSection(
	definition: USSectionDefinition,
	values: USSectionValues
): string {
	const core = encodeSubsection(definition.core, values.core);
	if (!definition.gpc) {
		return core;
	}
	return `${core}.${encodeSubsection(GPC_SUBSECTION, {
		Gpc: values.gpc ? 1 : 0,
		SubsectionType: GPC_SUBSECTION_TYPE,
	})}`;
};

export interface EncodedGPPSection {
	id: number;
	encoded: string;
}

export const encodeGPPString = function encodeGPPString(
	sections: readonly EncodedGPPSection[]
): string {
	if (sections.length === 0) {
		return '';
	}
	const ordered = [...sections].sort((left, right) => left.id - right.id);
	const header = compressedBase64Url(
		fixedInteger(GPP_HEADER_ID, 6) +
			fixedInteger(GPP_HEADER_VERSION, 6) +
			fibonacciRange(ordered.map((section) => section.id))
	);
	return [header, ...ordered.map((section) => section.encoded)].join('~');
};
