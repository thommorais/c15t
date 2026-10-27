import { afterEach, describe, expect, it, vi } from 'vitest';

import { generateSubjectId } from '../generate-subject-id';

const fromHex = (hex: string): number[] => {
	const bytes: number[] = [];
	for (let index = 0; index < hex.length; index += 2) {
		bytes.push(Number.parseInt(hex.slice(index, index + 2), 16));
	}
	return bytes;
};

const CASES = [
	{
		bytes: '000000000000000000000000',
		id: 'sub_4Zrjtb44miwSTU2EYMYtuVWfaAPR',
		nowMillis: 1,
	},
	{
		bytes: '000000000000000000000001',
		id: 'sub_4ZrjtiRsJnoW34Px8dAvhPTKJiWc',
		nowMillis: 58_123_456_789,
	},
	{
		bytes: 'ffffffffffffffffffffffff',
		id: 'sub_4ZrjtiRsJnoasFgQkJmLeDNrs7fC',
		nowMillis: 58_123_456_789,
	},
	{
		bytes: '01096a7b8c9d0e1f20ab11cd',
		id: 'sub_4ZrjtNN3QTDfdH8RQdZEAE8ohrCk',
		nowMillis: -100_000_000_000,
	},
	{
		bytes: 'a1b2c3d4e5f60718293a4b5c',
		id: 'sub_4ZrjtiRsJnoZ63G1p3FjTdWdHA6P',
		nowMillis: 58_123_456_789,
	},
	{
		bytes: '9a0f1c2b3d4e5f60718293ab',
		id: 'sub_4ZrjtmCtGLiMkPniH4rf1naxRKTp',
		nowMillis: 80_000_000_000,
	},
	{
		bytes: '000000000000000000000000',
		id: 'sub_11111115qCHTcgbQwpvYZQ9d',
		nowMillis: 1_700_000_000_001,
	},
	{
		bytes: '000000000000000000000000',
		id: 'sub_11111111111111111111',
		nowMillis: 1_700_000_000_000,
	},
] as const;

const pin = (bytes: number[], nowMillis: number): void => {
	vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation(
		<Source extends ArrayBufferView | ArrayBuffer>(buffer: Source): Source => {
			const target =
				buffer instanceof ArrayBuffer
					? new Uint8Array(buffer)
					: new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
			for (let index = 0; index < 12; index += 1) {
				target[8 + index] = bytes[index] ?? 0;
			}
			return buffer;
		}
	);
	vi.spyOn(Date, 'now').mockReturnValue(nowMillis);
};

afterEach(() => {
	vi.restoreAllMocks();
});

describe('generateSubjectId cross-language vectors', () => {
	it.each(CASES)(
		'encodes $bytes at clock $nowMillis',
		({ bytes, id, nowMillis }: (typeof CASES)[number]) => {
			pin(fromHex(bytes), nowMillis);

			expect(generateSubjectId()).toBe(id);
		}
	);
});
