import * as v from 'valibot';

const isoDateOrTimestampSchema = v.union(
	[v.pipe(v.string(), v.isoDate()), v.pipe(v.string(), v.isoTimestamp())],
	'Expected an ISO 8601 date or timestamp'
);

export const experimentSummaryQuerySchema = v.object({
	domain: v.optional(
		v.pipe(
			v.string(),
			v.minLength(1),
			v.description('Only consents recorded for this domain name.'),
			v.examples(['example.com'])
		)
	),
	from: v.optional(
		v.pipe(
			isoDateOrTimestampSchema,
			v.description(
				'Only consents given at or after this instant. A date without a ' +
					'time means the start of that day, UTC. Must not be later than `to`.'
			),
			v.examples(['2026-09-01', '2026-09-01T00:00:00Z'])
		)
	),
	to: v.optional(
		v.pipe(
			isoDateOrTimestampSchema,
			v.description(
				'Only consents given at or before this instant. A date without a ' +
					'time means the end of that day, UTC, so `2026-09-30` includes ' +
					'the whole of the 30th.'
			),
			v.examples(['2026-09-30', '2026-09-30T23:59:59Z'])
		)
	),
});

export const EXPERIMENT_SUMMARY_ACTIONS = [
	'accept_all',
	'custom',
	'opt_out',
	'reject_all',
	'unknown',
] as const;

export type ExperimentSummaryAction =
	(typeof EXPERIMENT_SUMMARY_ACTIONS)[number];

const actionCount = v.pipe(v.number(), v.integer(), v.minValue(0));

export const experimentArmSummarySchema = v.object({
	arm: v.string(),
	byAction: v.object({
		accept_all: actionCount,
		custom: actionCount,
		opt_out: actionCount,
		reject_all: actionCount,
		unknown: actionCount,
	}),
	bySurface: v.record(v.string(), v.number()),
	choices: v.pipe(v.number(), v.integer(), v.minValue(0)),
	medianTimeToDecisionMs: v.nullable(v.number()),
});

export const experimentSummaryOutputSchema = v.object({
	arms: v.array(experimentArmSummarySchema),
	experimentId: v.string(),
	from: v.nullable(v.string()),
	to: v.nullable(v.string()),
});

export type ExperimentSummaryQuery = v.InferOutput<
	typeof experimentSummaryQuerySchema
>;
export type ExperimentSummaryOutput = v.InferOutput<
	typeof experimentSummaryOutputSchema
>;
export type ExperimentArmSummary = v.InferOutput<
	typeof experimentArmSummarySchema
>;
