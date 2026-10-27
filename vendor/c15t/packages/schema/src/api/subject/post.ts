import * as v from 'valibot';

import {
	consentPolicyTypeSchema,
	legalDocumentPolicyTypeSchema,
	policyTypeSchema,
} from '../../domain/consent-policy';
import { ADDITIONAL_CONSENT_V2_PATTERN } from '../../shared/ad-tech-provider';
import { subjectChoiceWireSchema } from './choice-wire';
import { vendorChoiceWireSchema } from './vendor-choice-wire';

export const subjectIdSchema = v.pipe(
	v.string(),
	v.regex(/^sub_[1-9A-HJ-NP-Za-km-z]+$/u, 'Invalid subject ID format'),
	v.description('Client-generated subject ID in sub_xxx format.'),
	v.examples(['sub_2jv6z8n4q9'])
);

const baseSubjectConsentSchema = v.object({
	addtlConsent: v.optional(
		v.pipe(
			v.string(),
			v.regex(
				ADDITIONAL_CONSENT_V2_PATTERN,
				'Invalid Additional Consent v2 string'
			),
			v.description(
				'Google Additional Consent v2 string for ad tech providers outside the IAB Global Vendor List. Stored only with tcString.'
			),
			v.examples(['2~89.486~dv.2572'])
		)
	),
	consentAction: v.optional(
		v.pipe(
			v.string(),
			v.description('User action that produced this consent state.'),
			v.examples(['all', 'necessary', 'custom'])
		)
	),
	documentSnapshotToken: v.optional(
		v.pipe(
			v.string(),
			v.description(
				'Signed legal-document snapshot token from the rendered document view.'
			)
		)
	),
	domain: v.pipe(
		v.string(),
		v.description('Domain where consent was collected.'),
		v.examples(['example.com'])
	),
	externalSubjectId: v.optional(
		v.pipe(
			v.string(),
			v.description('External user ID from your authentication system.'),
			v.examples(['user_123'])
		)
	),
	givenAt: v.pipe(
		v.number(),
		v.minValue(-8_640_000_000_000_000),
		v.maxValue(8_640_000_000_000_000),
		v.description('Timestamp when consent was given, in epoch milliseconds.'),
		v.examples([1_735_689_600_000])
	),
	identityProvider: v.optional(
		v.pipe(
			v.string(),
			v.description('Identity provider name for the external subject ID.'),
			v.examples(['auth0', 'clerk'])
		)
	),
	identityToken: v.optional(
		v.pipe(
			v.string(),
			v.description(
				'Identity token signed by your server, proving externalSubjectId. Unverified links are stored but not returned by external-id reads.'
			)
		)
	),
	jurisdiction: v.optional(
		v.pipe(
			v.string(),
			v.description('Ignored. Sent by 2.x clients only.'),
			v.examples(['GDPR'])
		)
	),
	jurisdictionModel: v.optional(
		v.pipe(
			v.string(),
			v.description('Deprecated name for `model`. Sent by 2.x clients.'),
			v.examples(['opt-in', 'opt-out', 'iab'])
		)
	),
	metadata: v.optional(
		v.pipe(
			v.record(v.string(), v.unknown()),
			v.description('Additional audit metadata to store with the consent.')
		)
	),
	model: v.optional(
		v.pipe(
			v.string(),
			v.description(
				'Consent model the client applied. Used when no policy decision is available.'
			),
			v.examples(['opt-in', 'opt-out', 'iab'])
		)
	),
	policySnapshotToken: v.optional(
		v.pipe(
			v.string(),
			v.description('Signed policy snapshot token returned by /init.')
		)
	),
	subjectId: subjectIdSchema,
	tcString: v.optional(
		v.pipe(
			v.string(),
			v.description('IAB TCF TC string for IAB consent submissions.')
		)
	),
	type: policyTypeSchema,
	uiSource: v.optional(
		v.pipe(
			v.string(),
			v.description('UI surface that collected the consent.'),
			v.examples(['banner', 'dialog', 'widget'])
		)
	),
});

const manifestDecisionInputEntries = {
	country: v.optional(
		v.nullable(
			v.pipe(
				v.string(),
				v.description('Country input used by manifest-mode decision replay.'),
				v.examples(['DE'])
			)
		)
	),
	fingerprint: v.optional(
		v.pipe(
			v.string(),
			v.description(
				'Runtime policy fingerprint asserted by manifest-mode clients.'
			)
		)
	),
	gpc: v.optional(
		v.pipe(
			v.boolean(),
			v.description('Global Privacy Control input used by manifest-mode saves.')
		)
	),
	language: v.optional(
		v.pipe(
			v.string(),
			v.description('Language input used by manifest-mode decision replay.'),
			v.examples(['en'])
		)
	),
	policyId: v.optional(
		v.nullable(
			v.pipe(
				v.string(),
				v.description(
					'Runtime policy ID to recompute on write. Null asserts a successful no-match resolution.'
				),
				v.examples(['eu_opt_in'])
			)
		)
	),
	region: v.optional(
		v.nullable(
			v.pipe(
				v.string(),
				v.description('Region input used by manifest-mode decision replay.'),
				v.examples(['BE'])
			)
		)
	),
};

export const subjectCookieBannerInputSchema = v.object({
	...baseSubjectConsentSchema.entries,
	...manifestDecisionInputEntries,
	choice: v.optional(subjectChoiceWireSchema),
	preferences: v.pipe(
		v.record(v.string(), v.boolean()),
		v.description('Consent preferences keyed by category.'),
		v.examples([{ marketing: false, measurement: true, necessary: true }])
	),
	type: v.literal('cookie_banner'),
	vendorChoice: v.optional(vendorChoiceWireSchema),
});

export const subjectPolicyBasedInputSchema = v.object({
	...baseSubjectConsentSchema.entries,
	policyHash: v.optional(
		v.pipe(
			v.string(),
			v.description('Release hash for the legal document being accepted.'),
			v.examples(['sha256:abc123'])
		)
	),
	policyId: v.optional(
		v.pipe(
			v.string(),
			v.description(
				'Internal c15t policy ID. Prefer documentSnapshotToken or policyHash for legal documents when available.'
			),
			v.examples(['pol_123'])
		)
	),
	preferences: v.optional(
		v.pipe(
			v.record(v.string(), v.boolean()),
			v.description('Optional consent preferences keyed by category.')
		)
	),
	type: legalDocumentPolicyTypeSchema,
});

export const subjectOtherConsentInputSchema = v.object({
	...baseSubjectConsentSchema.entries,
	preferences: v.optional(
		v.pipe(
			v.record(v.string(), v.boolean()),
			v.description('Optional consent preferences keyed by category.')
		)
	),
	type: v.picklist(['marketing_communications', 'age_verification', 'other']),
});

export const postSubjectInputSchema = v.variant('type', [
	subjectCookieBannerInputSchema,
	subjectPolicyBasedInputSchema,
	subjectOtherConsentInputSchema,
]);

export const postSubjectOutputSchema = v.object({
	appliedPreferences: v.optional(v.record(v.string(), v.boolean())),
	consentId: v.string(),
	domain: v.string(),
	domainId: v.string(),
	givenAt: v.date(),
	metadata: v.optional(v.record(v.string(), v.unknown())),
	subjectId: v.string(),
	type: consentPolicyTypeSchema,
	uiSource: v.optional(v.string()),
});

export const postSubjectErrorSchemas = {
	consentCreationFailed: v.object({
		domain: v.string(),

		subjectId: v.string(),
	}),
	domainCreationFailed: v.object({
		domain: v.string(),
	}),
	inputValidationFailed: v.object({
		fieldErrors: v.record(v.string(), v.array(v.string())),

		formErrors: v.array(v.string()),
	}),
	legalDocumentProofRequired: v.object({
		code: v.literal('LEGAL_DOCUMENT_PROOF_REQUIRED'),
	}),
	legalDocumentSnapshotExpired: v.object({
		code: v.literal('LEGAL_DOCUMENT_SNAPSHOT_EXPIRED'),
	}),
	legalDocumentSnapshotInvalid: v.object({
		code: v.literal('LEGAL_DOCUMENT_SNAPSHOT_INVALID'),
	}),
	legalDocumentSnapshotRequired: v.object({
		code: v.literal('LEGAL_DOCUMENT_SNAPSHOT_REQUIRED'),
	}),
	policyCreationFailed: v.object({
		type: v.string(),
	}),
	policyInactive: v.object({
		policyId: v.string(),
		type: v.string(),
	}),
	policyNotFound: v.object({
		policyId: v.optional(v.string()),
		type: v.string(),
	}),
	policySnapshotExpired: v.object({
		code: v.literal('POLICY_SNAPSHOT_EXPIRED'),
	}),
	policySnapshotInvalid: v.object({
		code: v.literal('POLICY_SNAPSHOT_INVALID'),
	}),
	policySnapshotRequired: v.object({
		code: v.literal('POLICY_SNAPSHOT_REQUIRED'),
	}),
	purposeCreationFailed: v.object({
		purposeCode: v.string(),
	}),
	stalePolicy: v.object({
		code: v.literal('STALE_POLICY'),
		reason: v.optional(v.string()),
	}),
	subjectCreationFailed: v.object({
		subjectId: v.string(),
	}),
};

export type PostSubjectInput = v.InferOutput<typeof postSubjectInputSchema>;
export type PostSubjectOutput = v.InferOutput<typeof postSubjectOutputSchema>;
