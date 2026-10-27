import baseX from 'base-x';

import { hashSha256Hex } from './policy-fingerprint';

const PREFIXES = {
	auditLog: 'log',
	consent: 'cns',
	consentPolicy: 'pol',
	consentPurpose: 'pur',
	domain: 'dom',
	runtimePolicyDecision: 'rpd',
	subject: 'sub',
} as const;

export type EntityKind = keyof typeof PREFIXES;

// oxlint-disable-next-line no-inline-comments -- Bundlers require this annotation at the call.
const b58 = /* @__PURE__ */ baseX(
	'123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
);

const EPOCH_TIMESTAMP = 1_700_000_000_000;
const ID_BYTE_LENGTH = 20;
const TIMESTAMP_BYTE_LENGTH = 8;

const writeTimestamp = function writeTimestamp(
	buf: Uint8Array,
	timestamp: number
): void {
	const rawOffset = timestamp - EPOCH_TIMESTAMP;
	const offset = Number.isFinite(rawOffset) ? Math.max(0, rawOffset) : 0;

	const view = new DataView(buf.buffer);
	view.setUint32(0, Math.floor(offset / 2 ** 32), false);
	view.setUint32(4, offset % 2 ** 32, false);
};

export const generateDeterministicId = async function generateDeterministicId(
	kind: EntityKind,
	timestamp: number,
	identity: readonly (string | null)[]
): Promise<string> {
	const digest = await hashSha256Hex(JSON.stringify(identity));
	const buf = new Uint8Array(ID_BYTE_LENGTH);

	writeTimestamp(buf, timestamp);

	for (let i = TIMESTAMP_BYTE_LENGTH; i < ID_BYTE_LENGTH; i += 1) {
		const offset = (i - TIMESTAMP_BYTE_LENGTH) * 2;
		buf[i] = Number.parseInt(digest.slice(offset, offset + 2), 16);
	}

	return `${PREFIXES[kind]}_${b58.encode(buf)}`;
};

export interface ConsentSubmissionIdentity {
	readonly tenantId?: string;
	readonly subjectId: string;
	readonly domainId: string;
	readonly policyId?: string | null;
	readonly givenAt: Date;
}

export const buildConsentId = function buildConsentId(
	input: ConsentSubmissionIdentity
): Promise<string> {
	return generateDeterministicId('consent', input.givenAt.getTime(), [
		input.tenantId ?? null,
		input.subjectId,
		input.domainId,
		input.policyId ?? null,
		input.givenAt.toISOString(),
	]);
};

export const generateEntityId = function generateEntityId(
	kind: EntityKind,
	now = Date.now()
): string {
	const buf = new Uint8Array(ID_BYTE_LENGTH);
	writeTimestamp(buf, now);
	crypto.getRandomValues(buf.subarray(TIMESTAMP_BYTE_LENGTH));
	return `${PREFIXES[kind]}_${b58.encode(buf)}`;
};
