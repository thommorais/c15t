import * as v from 'valibot';

import type { LegalDocumentPolicyType } from '../shared/legal-document-types';
import { isLegalDocumentType } from '../shared/legal-document-types';

export type {
	LegalDocumentPolicyType,
	LegalDocumentTypePrefix,
} from '../shared/legal-document-types';
export {
	isLegalDocumentType,
	LEGAL_DOCUMENT_TYPE_PREFIXES,
} from '../shared/legal-document-types';

export const legalDocumentPolicyTypeSchema = v.pipe(
	v.string(),
	v.check(
		(value: string): boolean => isLegalDocumentType(value),
		'Invalid legal document type'
	)
);

export const policyTypeSchema = v.picklist([
	'cookie_banner',
	'privacy_policy',
	'dpa',
	'terms_and_conditions',
	'marketing_communications',
	'age_verification',
	'other',
]);

export const consentPolicyTypeSchema = v.union([
	policyTypeSchema,
	legalDocumentPolicyTypeSchema,
]);

export const consentPolicySchema = v.object({
	createdAt: v.optional(v.date(), () => new Date()),
	effectiveDate: v.date(),
	hash: v.nullish(v.string()),
	id: v.string(),
	isActive: v.optional(v.boolean(), true),
	tenantId: v.nullish(v.string()),
	type: consentPolicyTypeSchema,
	version: v.string(),
});

export type PolicyType = v.InferOutput<typeof policyTypeSchema>;
export type ConsentPolicyType = PolicyType | LegalDocumentPolicyType;
export type ConsentPolicy = Omit<
	v.InferOutput<typeof consentPolicySchema>,
	'type'
> & {
	type: ConsentPolicyType;
};
