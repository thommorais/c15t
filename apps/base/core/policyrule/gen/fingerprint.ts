import { writeFileSync } from 'node:fs';

import {
	compareCanonical,
	createDeterministicFingerprintSync,
	stableStringify,
} from '@c15t/schema/types';

const keys = [
	'a', 'A', 'b', 'B', 'ab', 'aB', 'Ab', 'AB', 'abc', 'a_b', 'a-b', 'a.b', 'a b',
	'_', '-', ' ', '0', '9', 'z', 'Z', 'a0', 'a9', 'aa', 'a~', 'a$', '$', '~',
	'id', 'Id', 'ID', 'iD', 'choiceMs', 'choicems', 'copyRevision', 'scopeMode',
	'storeIp', 'storeIP', 'e', 'f',
];

const pairs = [];
for (const left of keys) {
	for (const right of keys) {
		pairs.push({ left, right, sign: Math.sign(compareCanonical(left, right)) });
	}
}

const values = [
	null,
	true,
	false,
	0,
	-1,
	1.5,
	31536000000,
	1e21,
	0.000001,
	1e-7,
	'',
	'plain',
	'quote " backslash \\ slash /',
	'controls \b \f \n \r \t \u0001 \u001f',
	'html < > &',
	'separators    ',
	'unicode é 日本 😀',
	[],
	{},
	[1, 'two', null, { b: 1, a: 2 }],
	{ b: 1, a: 2, A: 3, _: 4, '-': 5, a_b: 6, ab: 7, aB: 8 },
	{ nested: { z: [{ y: 1, x: null }], a: {} }, copyRevision: null },
	{
		actions: { allowed: ['accept', 'reject'], equivalent: [['accept', 'reject']], required: [] },
		copyRevision: null,
		domain: 'policy',
		model: 'opt-in',
		validity: { choiceMs: 31536000000, noticeMs: 31536000000 },
		version: 1,
	},
];

const vectors = values.map((value) => ({
	value,
	canonical: stableStringify(value),
	fingerprint: createDeterministicFingerprintSync(value),
}));

const out = process.argv[2] ?? 'testdata/fingerprint.json';
writeFileSync(out, `${JSON.stringify({ pairs, vectors }, null, '\t')}\n`);
