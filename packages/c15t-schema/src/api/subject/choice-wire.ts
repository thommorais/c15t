import * as v from 'valibot';

import {
	isPlainPolicyObject,
	POLICY_OPTIONAL_CATEGORIES,
} from '../../shared/policy-rule';

const plainObjectSchema = v.custom<Record<string, unknown>>(
	(input) => isPlainPolicyObject(input),
	'Expected a plain object'
);

const MAX_DATE_MS = 8_640_000_000_000_000;

export const wireTimestampSchema = v.pipe(
	v.number(),
	v.integer(),
	v.minValue(0),
	v.maxValue(MAX_DATE_MS),
	v.description('Epoch milliseconds when the category was confirmed.')
);

export const subjectChoiceBasisWireSchema = v.pipe(
	plainObjectSchema,
	v.variant('kind', [
		v.strictObject({
			fingerprint: v.pipe(
				v.string(),
				v.minLength(1),
				v.description('Choice prompt fingerprint (domain choice, version 1).')
			),
			kind: v.literal('choice-v1'),
		}),
		v.strictObject({
			kind: v.literal('legacy-v2'),
			materialFingerprint: v.optional(
				v.pipe(
					v.string(),
					v.minLength(1),
					v.description(
						'v2 material policy fingerprint, when the record had one.'
					)
				)
			),
		}),
	])
);

export const subjectCategoryReceiptWireSchema = v.pipe(
	plainObjectSchema,
	v.strictObject({
		basis: subjectChoiceBasisWireSchema,
		confirmedAt: wireTimestampSchema,
		value: v.boolean(),
	})
);

const categoryReceiptEntries = Object.fromEntries(
	POLICY_OPTIONAL_CATEGORIES.map((category) => [
		category,
		v.optional(subjectCategoryReceiptWireSchema),
	])
) as Record<
	(typeof POLICY_OPTIONAL_CATEGORIES)[number],
	v.OptionalSchema<typeof subjectCategoryReceiptWireSchema, undefined>
>;

export const subjectChoiceWireSchema = v.pipe(
	plainObjectSchema,
	v.strictObject({
		categories: v.pipe(
			plainObjectSchema,
			v.strictObject(categoryReceiptEntries)
		),
		version: v.literal(3),
	})
);

export type SubjectChoiceBasisWire = v.InferOutput<
	typeof subjectChoiceBasisWireSchema
>;
export type SubjectCategoryReceiptWire = v.InferOutput<
	typeof subjectCategoryReceiptWireSchema
>;
export type SubjectChoiceWire = v.InferOutput<typeof subjectChoiceWireSchema>;
