import * as v from 'valibot';

import { POLICY_CONSENT_CATEGORIES } from './policy-rule';
import type { PolicyConsentCategory } from './policy-rule';

export type VendorCategoryCondition =
	| PolicyConsentCategory
	| { and: VendorCategoryCondition | VendorCategoryCondition[] }
	| { or: VendorCategoryCondition | VendorCategoryCondition[] }
	| { not: VendorCategoryCondition };

const categoryNameSchema = v.picklist(POLICY_CONSENT_CATEGORIES);

export const vendorCategoryConditionSchema: v.GenericSchema<VendorCategoryCondition> =
	v.lazy(() =>
		v.union([
			categoryNameSchema,
			v.strictObject({
				and: v.union([
					vendorCategoryConditionSchema,
					v.pipe(v.array(vendorCategoryConditionSchema), v.minLength(1)),
				]),
			}),
			v.strictObject({
				or: v.union([
					vendorCategoryConditionSchema,
					v.pipe(v.array(vendorCategoryConditionSchema), v.minLength(1)),
				]),
			}),
			v.strictObject({ not: vendorCategoryConditionSchema }),
		])
	);

export const vendorIdSchema = v.pipe(
	v.string(),
	v.regex(
		/^[a-z0-9][a-z0-9._-]{0,63}$/u,
		'Vendor id must be a lowercase slug of up to 64 characters.'
	),
	v.description('Stable vendor slug used by scripts, rules and iframes.'),
	v.examples(['meta-pixel', 'google-analytics'])
);

export const vendorSchema = v.object({
	category: vendorCategoryConditionSchema,
	description: v.optional(v.string()),
	disabled: v.optional(v.boolean()),
	homepageUrl: v.optional(v.pipe(v.string(), v.url())),
	id: vendorIdSchema,
	legalName: v.optional(v.string()),
	name: v.string(),
	privacyPolicyUrl: v.pipe(v.string(), v.url()),
});

export type Vendor = v.InferOutput<typeof vendorSchema>;
