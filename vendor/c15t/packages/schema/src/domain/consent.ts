import * as v from 'valibot';

export const consentSchema = v.object({
	addtlConsent: v.nullish(v.string()),
	consentAction: v.nullish(v.string()),
	domainId: v.string(),
	experimentArm: v.nullish(v.string()),
	experimentId: v.nullish(v.string()),
	givenAt: v.optional(v.date(), () => new Date()),
	id: v.string(),
	ipAddress: v.nullish(v.string()),
	jurisdiction: v.nullish(v.string()),
	jurisdictionModel: v.nullish(v.string()),
	metadata: v.nullish(v.record(v.string(), v.unknown())),
	policyId: v.optional(v.string()),
	purposeIds: v.array(v.string()),
	runtimePolicyDecisionId: v.nullish(v.string()),
	runtimePolicySource: v.nullish(
		v.picklist([
			'snapshot_token',
			'snapshot_token_replayed',
			'write_time_fallback',
			'manifest_recompute',
		])
	),
	subjectId: v.string(),
	tcString: v.nullish(v.string()),
	tenantId: v.nullish(v.string()),
	timeToDecisionMs: v.nullish(v.number()),
	uiSource: v.nullish(v.string()),
	userAgent: v.nullish(v.string()),
	validUntil: v.nullish(v.date()),
});

export type Consent = v.InferOutput<typeof consentSchema>;
