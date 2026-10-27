import * as v from 'valibot';

import { subjectChoiceWireSchema } from './choice-wire';
import { subjectIdSchema } from './post';
import { vendorChoiceWireSchema } from './vendor-choice-wire';

export const getSubjectInputSchema = v.object({
	id: v.pipe(
		subjectIdSchema,
		v.description('Client-generated subject ID in sub_xxx format.'),
		v.examples(['sub_2jv6z8n4q9'])
	),
	type: v.optional(
		v.pipe(
			v.string(),
			v.description(
				'Optional consent policy type or comma-separated policy types to filter by.'
			),
			v.examples(['cookie_banner', 'privacy_policy,cookie_banner'])
		)
	),
});

export const getSubjectQuerySchema = v.object({
	type: v.optional(
		v.pipe(
			v.string(),
			v.description(
				'Optional consent policy type or comma-separated policy types to filter by.'
			),
			v.examples(['cookie_banner', 'privacy_policy,cookie_banner'])
		)
	),
});

export const getSubjectParamsSchema = v.object({
	id: v.pipe(
		subjectIdSchema,
		v.description('Client-generated subject ID in sub_xxx format.'),
		v.examples(['sub_2jv6z8n4q9'])
	),
});

export const consentItemSchema = v.object({
	choice: v.optional(v.nullable(subjectChoiceWireSchema)),
	givenAt: v.date(),
	id: v.string(),
	isLatestPolicy: v.boolean(),
	policyEffectiveDate: v.optional(v.date()),
	policyHash: v.optional(v.string()),
	policyId: v.optional(v.string()),
	policyVersion: v.optional(v.string()),
	preferences: v.optional(v.record(v.string(), v.boolean())),
	type: v.string(),
	vendorChoice: v.optional(v.nullable(vendorChoiceWireSchema)),
});

export const getSubjectOutputSchema = v.object({
	consents: v.array(consentItemSchema),
	isValid: v.boolean(),
	subject: v.object({
		createdAt: v.optional(v.date()),

		externalId: v.optional(v.string()),
		id: v.string(),
		identityProvider: v.optional(v.string()),
	}),
	subjectChoice: v.optional(v.nullable(subjectChoiceWireSchema)),
	subjectVendorChoice: v.optional(v.nullable(vendorChoiceWireSchema)),
});

export const getSubjectErrorSchemas = {
	inputValidationFailed: v.object({
		fieldErrors: v.record(v.string(), v.array(v.string())),
		formErrors: v.array(v.string()),
	}),
	subjectNotFound: v.object({
		subjectId: v.string(),
	}),
};

export type GetSubjectInput = v.InferOutput<typeof getSubjectInputSchema>;
export type GetSubjectQuery = v.InferOutput<typeof getSubjectQuerySchema>;
export type GetSubjectParams = v.InferOutput<typeof getSubjectParamsSchema>;
export type GetSubjectOutput = v.InferOutput<typeof getSubjectOutputSchema>;
export type ConsentItem = v.InferOutput<typeof consentItemSchema>;
