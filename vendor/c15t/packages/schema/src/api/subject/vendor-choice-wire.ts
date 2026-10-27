import * as v from 'valibot';

import { isPlainPolicyObject } from '../../shared/policy-rule';
import { vendorIdSchema } from '../../shared/vendor';
import { wireTimestampSchema } from './choice-wire';

const plainObjectSchema = v.custom<Record<string, unknown>>(
	(input) => isPlainPolicyObject(input),
	'Expected a plain object'
);

export const vendorChoiceWireSchema = v.pipe(
	plainObjectSchema,
	v.strictObject({
		confirmedAt: v.pipe(
			wireTimestampSchema,
			v.description('Epoch milliseconds when the vendor grants were confirmed.')
		),
		grants: v.pipe(
			plainObjectSchema,
			v.record(vendorIdSchema, v.boolean()),
			v.description('Granted flag per declared vendor id.')
		),
		version: v.literal(1),
	})
);

export type VendorChoiceWire = v.InferOutput<typeof vendorChoiceWireSchema>;
