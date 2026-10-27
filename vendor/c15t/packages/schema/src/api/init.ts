import * as v from 'valibot';

import { adTechProviderSchema } from '../shared/ad-tech-provider';
import { brandingSchema } from '../shared/branding';
import { globalVendorListSchema } from '../shared/gvl';
import { hostingSchema } from '../shared/hosting';
import { nonIABVendorSchema } from '../shared/non-iab-vendor';
import { policyResolutionWireSchema } from '../shared/policy-wire-schema';
import { vendorSchema } from '../shared/vendor';

export const titleDescriptionSchema = v.object({
	description: v.optional(v.string()),
	title: v.optional(v.string()),
});

export const cookieBannerTranslationsSchema = v.object({
	...titleDescriptionSchema.entries,
	noticeDescription: v.optional(v.string()),
	noticeTitle: v.optional(v.string()),
});

export const vendorListTranslationsSchema = v.optional(
	v.object({
		disabledByCategory: v.optional(v.string()),
		privacyPolicy: v.optional(v.string()),
		switchLabel: v.optional(v.string()),
		title: v.optional(v.string()),
	})
);

export const consentManagerDialogTranslationsSchema = v.object({
	...titleDescriptionSchema.entries,
	vendors: vendorListTranslationsSchema,
});

export const rightsTranslationsSchema = v.optional(
	v.object({
		optOut: v.optional(v.string()),
		preferences: v.optional(v.string()),
	})
);

export const translationsSchema = v.object({
	common: v.object({
		acceptAll: v.optional(v.string()),
		acknowledge: v.optional(v.string()),
		customize: v.optional(v.string()),
		dismiss: v.optional(v.string()),
		rejectAll: v.optional(v.string()),
		save: v.optional(v.string()),
	}),
	consentGate: v.optional(
		v.object({
			actionButton: v.optional(v.string()),
			title: v.optional(v.string()),
		})
	),
	consentManagerDialog: consentManagerDialogTranslationsSchema,
	consentTypes: v.object({
		experience: v.optional(titleDescriptionSchema),
		functionality: v.optional(titleDescriptionSchema),
		marketing: v.optional(titleDescriptionSchema),
		measurement: v.optional(titleDescriptionSchema),
		necessary: v.optional(titleDescriptionSchema),
	}),
	cookieBanner: cookieBannerTranslationsSchema,
	legalLinks: v.optional(
		v.object({
			cookiePolicy: v.optional(v.string()),
			privacyPolicy: v.optional(v.string()),
			termsOfService: v.optional(v.string()),
		})
	),
	rights: rightsTranslationsSchema,
});

export const locationSchema = v.object({
	countryCode: v.nullable(v.string()),
	regionCode: v.nullable(v.string()),
});

export const initOutputSchema = v.object({
	adTechProviders: v.optional(v.array(adTechProviderSchema)),
	branding: brandingSchema,
	cmpId: v.optional(v.number()),
	customVendors: v.optional(v.array(nonIABVendorSchema)),
	gvl: v.optional(v.nullable(globalVendorListSchema)),
	gvlReference: v.optional(
		v.object({
			context: v.optional(
				v.object({
					country: v.optional(v.string()),
					gpc: v.optional(v.boolean()),
					region: v.optional(v.string()),
				})
			),
			format: v.optional(v.literal('init')),
			language: v.string(),
			summary: v.optional(
				v.object({
					items: v.array(v.string()),
					vendorCount: v.number(),
				})
			),
			url: v.string(),
			vendorListVersion: v.number(),
		})
	),
	hosting: v.optional(hostingSchema),
	location: locationSchema,
	policyResolution: policyResolutionWireSchema,
	policySnapshotToken: v.optional(v.string()),
	resolvedPrivacySignals: v.optional(
		v.object({ gpc: v.optional(v.boolean()) })
	),
	translations: v.object({
		language: v.string(),
		translations: translationsSchema,
	}),
	vendorListVersion: v.optional(v.string()),
	vendors: v.optional(v.array(vendorSchema)),
});

export type InitOutput = v.InferOutput<typeof initOutputSchema>;
export type TranslationsResponse = v.InferOutput<typeof translationsSchema>;
export type LocationResponse = v.InferOutput<typeof locationSchema>;
