import * as v from 'valibot';

export const consentSessionSourceSchema = v.picklist([
	'render',
	'route',
	'init',
]);

export type ConsentSessionSource = v.InferOutput<
	typeof consentSessionSourceSchema
>;

export const consentSessionPolicySchema = v.object({
	fingerprint: v.string(),
	id: v.string(),
	matchedBy: v.picklist(['region', 'country', 'default', 'fallback']),
	model: v.picklist(['opt-in', 'opt-out', 'iab', 'none']),
});

export const consentSessionJourneySchema = v.object({
	domain: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(253))),
	id: v.pipe(v.string(), v.uuid()),
	prompt: v.picklist(['due', 'stored', 'not-required']),
	scope: v.picklist(['page', 'tab']),
	storedChoice: v.boolean(),
});

export const consentSessionReportSchema = v.object({
	adapter: v.optional(v.string()),
	country: v.nullable(v.string()),
	experiment: v.optional(
		v.object({
			arm: v.pipe(v.string(), v.minLength(1), v.maxLength(128)),
			id: v.pipe(v.string(), v.minLength(1), v.maxLength(128)),
		})
	),
	gpc: v.boolean(),
	journey: v.optional(consentSessionJourneySchema),
	language: v.string(),
	policy: v.nullable(consentSessionPolicySchema),
	region: v.nullable(v.string()),
	resolution: v.picklist(['matched', 'no-match', 'unconfigured', 'failed']),
	revision: v.string(),
	source: consentSessionSourceSchema,
	tenantId: v.optional(v.nullable(v.string())),
});

export type ConsentSessionReport = v.InferOutput<
	typeof consentSessionReportSchema
>;
