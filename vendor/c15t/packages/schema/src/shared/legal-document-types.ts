export const LEGAL_DOCUMENT_TYPE_PREFIXES = [
	'privacy_policy',
	'dpa',
	'terms_and_conditions',
] as const;

export type LegalDocumentTypePrefix =
	(typeof LEGAL_DOCUMENT_TYPE_PREFIXES)[number];

export type LegalDocumentPolicyType =
	| LegalDocumentTypePrefix
	| `${LegalDocumentTypePrefix}_${string}`;

export const isLegalDocumentType = (
	value: unknown
): value is LegalDocumentPolicyType =>
	typeof value === 'string' &&
	LEGAL_DOCUMENT_TYPE_PREFIXES.some(
		(prefix) =>
			value === prefix ||
			(value.startsWith(`${prefix}_`) && value.length > prefix.length + 1)
	);
