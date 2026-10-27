import * as v from 'valibot';

export const checkConsentQuerySchema = v.object({
	externalId: v.pipe(
		v.string(),
		v.description('External user ID from your authentication system.'),
		v.examples(['user_123'])
	),
	type: v.pipe(
		v.string(),
		v.description(
			'Consent policy type or comma-separated policy types to check.'
		),
		v.examples(['cookie_banner', 'privacy_policy,cookie_banner'])
	),
});

export const consentCheckResultSchema = v.object({
	hasConsent: v.boolean(),
	isLatestPolicy: v.boolean(),
});

export const checkConsentOutputSchema = v.object({
	results: v.record(v.string(), consentCheckResultSchema),
});

export const checkConsentErrorSchemas = {
	externalIdRequired: v.object({
		message: v.string(),
	}),
	inputValidationFailed: v.object({
		fieldErrors: v.record(v.string(), v.array(v.string())),

		formErrors: v.array(v.string()),
	}),
	typeRequired: v.object({
		message: v.string(),
	}),
};

export type CheckConsentQuery = v.InferOutput<typeof checkConsentQuerySchema>;
export type CheckConsentOutput = v.InferOutput<typeof checkConsentOutputSchema>;
export type ConsentCheckResult = v.InferOutput<typeof consentCheckResultSchema>;
