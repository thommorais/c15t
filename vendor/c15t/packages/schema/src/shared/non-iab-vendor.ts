import * as v from 'valibot';

export const nonIABVendorSchema = v.object({

	cookieMaxAgeSeconds: v.optional(
		v.pipe(v.number(), v.integer(), v.minValue(1))
	),

	dataCategories: v.optional(
		v.array(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(11)))
	),

	dataRetentionDays: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),

	description: v.optional(v.string()),

	features: v.optional(
		v.array(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(3)))
	),
	id: v.union([v.string(), v.pipe(v.number(), v.integer())]),

	legIntPurposes: v.optional(
		v.array(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(11)))
	),

	name: v.string(),

	privacyPolicyUrl: v.pipe(v.string(), v.url()),

	purposes: v.array(
		v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(11))
	),

	specialFeatures: v.optional(
		v.array(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(2)))
	),

	usesCookies: v.optional(v.boolean()),

	usesNonCookieAccess: v.optional(v.boolean()),
});

export const nonIABVendorConsentSchema = v.object({
	consented: v.boolean(),

	timestamp: v.number(),

	vendorId: v.union([v.string(), v.pipe(v.number(), v.integer())]),
});

export type NonIABVendor = v.InferOutput<typeof nonIABVendorSchema>;
export type NonIABVendorConsent = v.InferOutput<
	typeof nonIABVendorConsentSchema
>;
