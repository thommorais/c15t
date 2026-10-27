import type {
	CategoryDecision,
	ChoiceBasis,
	ConsentSubject,
	ExplicitChoice,
} from '../../../consent-record/types';
import type {
	StoredConsentEnvelope,
	StoredIabMetadata,
	StoredNoticeDismissal,
	StoredVendorChoice,
} from '../record-codec';

const FIELD_SEPARATOR = '&';
const KEY_VALUE_SEPARATOR = '=';
const LIST_SEPARATOR = '|';
const TUPLE_SEPARATOR = '.';

export const CATEGORY_CODES = [
	['functionality', 'fn'],
	['experience', 'ex'],
	['measurement', 'me'],
	['marketing', 'mk'],
] as const;

export const SUBJECT_CODES = [
	['subjectId', 'sid'],
	['externalId', 'eid'],
	['identityProvider', 'idp'],
] as const satisfies readonly (readonly [keyof ConsentSubject, string])[];

export const IAB_CODES = [
	['customVendorConsents', 'icv'],
	['customVendorLegitimateInterests', 'icvli'],
] as const satisfies readonly (readonly [keyof StoredIabMetadata, string])[];

const field = function field(key: string, value: string | number): string {
	return `${key}${KEY_VALUE_SEPARATOR}${value}`;
};

const subjectFields = function subjectFields(
	subject: ConsentSubject | undefined
): string[] {
	const fields: string[] = [];
	for (const [key, code] of SUBJECT_CODES) {
		const value = subject?.[key];
		if (value) {
			fields.push(field(code, encodeURIComponent(value)));
		}
	}
	return fields;
};

const orderedBasis = function orderedBasis(basis: ChoiceBasis): ChoiceBasis {
	if (basis.kind === 'choice-v1') {
		return { fingerprint: basis.fingerprint, kind: 'choice-v1' };
	}
	if (basis.materialFingerprint === undefined) {
		return { kind: 'legacy-v2' };
	}
	return { kind: 'legacy-v2', materialFingerprint: basis.materialFingerprint };
};

const orderedDecision = function orderedDecision(
	decision: CategoryDecision
): CategoryDecision {
	return {
		basis: orderedBasis(decision.basis),
		confirmedAt: decision.confirmedAt,
		value: decision.value,
	};
};

export const encodeStoredConsentEnvelopeJson =
	function encodeStoredConsentEnvelopeJson(
		envelope: StoredConsentEnvelope
	): string {
		const categories: ExplicitChoice['categories'] = {};
		for (const [category] of CATEGORY_CODES) {
			const decision = envelope.categories[category];
			if (decision) {
				categories[category] = orderedDecision(decision);
			}
		}
		const ordered: Record<string, unknown> = { version: 3 };
		if (envelope.subject && Object.keys(envelope.subject).length > 0) {
			ordered.subject = envelope.subject;
		}
		if (envelope.epoch) {
			ordered.epoch = envelope.epoch;
		}
		ordered.categories = categories;
		if (envelope.iab) {
			ordered.iab = envelope.iab;
		}
		return JSON.stringify(ordered);
	};

const basisKey = function basisKey(basis: ChoiceBasis): string {
	if (basis.kind === 'choice-v1') {
		return `c${encodeURIComponent(basis.fingerprint)}`;
	}
	return basis.materialFingerprint === undefined
		? 'l'
		: `l${encodeURIComponent(basis.materialFingerprint)}`;
};

const encodeBooleanMap = function encodeBooleanMap(
	map: Readonly<Record<string, boolean>>
): string {
	return Object.keys(map)
		.sort()
		.map(
			(id) =>
				`${map[id] ? '1' : '0'}${TUPLE_SEPARATOR}${encodeURIComponent(id)}`
		)
		.join(LIST_SEPARATOR);
};

export const encodeStoredConsentEnvelopeCompact =
	function encodeStoredConsentEnvelopeCompact(
		envelope: StoredConsentEnvelope
	): string {
		const fields = [field('v', 3), ...subjectFields(envelope.subject)];
		if (envelope.epoch) {
			fields.push(field('e', envelope.epoch));
		}

		const bases: string[] = [];
		const categoryFields: string[] = [];
		for (const [category, code] of CATEGORY_CODES) {
			const decision = envelope.categories[category];
			if (!decision) {
				continue;
			}
			const key = basisKey(decision.basis);
			let index = bases.indexOf(key);
			if (index < 0) {
				index = bases.push(key) - 1;
			}
			categoryFields.push(
				field(
					code,
					`${decision.value ? '1' : '0'}${TUPLE_SEPARATOR}${decision.confirmedAt}${TUPLE_SEPARATOR}${index}`
				)
			);
		}
		if (bases.length > 0) {
			fields.push(field('b', bases.join(LIST_SEPARATOR)));
		}
		fields.push(...categoryFields);

		for (const [key, code] of IAB_CODES) {
			const map = envelope.iab?.[key];
			if (map && Object.keys(map).length > 0) {
				fields.push(field(code, encodeBooleanMap(map)));
			}
		}

		return fields.join(FIELD_SEPARATOR);
	};

export const encodeNoticeDismissal = function encodeNoticeDismissal(
	record: StoredNoticeDismissal
): string {
	const encoded: StoredNoticeDismissal = {
		dismissedAt: record.dismissedAt,
		fingerprint: record.fingerprint,
		version: 1,
	};
	if (record.subject) {
		encoded.subject = record.subject;
	}
	return JSON.stringify(encoded);
};

export const encodeNoticeDismissalCompact =
	function encodeNoticeDismissalCompact(record: StoredNoticeDismissal): string {
		return [
			field('v', 1),
			field('t', record.dismissedAt),
			field('f', encodeURIComponent(record.fingerprint)),
		].join(FIELD_SEPARATOR);
	};

export const encodeNoticeSubjectCompact = function encodeNoticeSubjectCompact(
	record: StoredNoticeDismissal
): string {
	return [
		encodeNoticeDismissalCompact(record),
		...subjectFields(record.subject),
	].join(FIELD_SEPARATOR);
};

export const encodeVendorChoice = function encodeVendorChoice(
	record: StoredVendorChoice
): string {
	const encoded: StoredVendorChoice = {
		confirmedAt: record.confirmedAt,
		denied: [...record.denied].sort(),
		version: 1,
	};
	if (record.subject && Object.keys(record.subject).length > 0) {
		encoded.subject = { ...record.subject };
	}
	return JSON.stringify(encoded);
};

export const encodeVendorChoiceCompact = function encodeVendorChoiceCompact(
	record: StoredVendorChoice
): string {
	const fields = [field('v', 1), field('t', record.confirmedAt)];
	if (record.denied.length > 0) {
		fields.push(
			field(
				'd',
				[...record.denied]
					.sort()
					.map((id) => encodeURIComponent(id))
					.join(LIST_SEPARATOR)
			)
		);
	}
	fields.push(...subjectFields(record.subject));
	return fields.join(FIELD_SEPARATOR);
};
