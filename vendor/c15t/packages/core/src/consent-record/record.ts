import type {
	EvaluationPolicy,
	ExplicitChoice,
	OptionalConsentCategory,
} from './types';
import {
	checkTimestamp,
	isOptionalConsentCategory,
	isPlainRecord,
	ownKeys,
} from './validation';
import type { RecordIssue } from './validation';

export interface RecordPatchOptions {
	policy: EvaluationPolicy;
	actionAt: number;
	now?: number;
}

export type RecordPatchResult =
	| {
			ok: true;
			choice: ExplicitChoice;
			confirmed: readonly OptionalConsentCategory[];
	  }
	| { ok: false; issues: RecordIssue[] };

const EMPTY_CHOICE: ExplicitChoice = Object.freeze({
	categories: Object.freeze({}),
	version: 3,
}) as ExplicitChoice;

export const recordCategoryPatch = function recordCategoryPatch(
	previous: ExplicitChoice | null,
	patch: unknown,
	options: RecordPatchOptions
): RecordPatchResult {
	const issues: RecordIssue[] = [];
	const timestampIssue = checkTimestamp(
		options.actionAt,
		options.now ?? options.actionAt
	);
	if (timestampIssue) {
		issues.push({ code: timestampIssue, path: 'actionAt' });
	}
	if (!isPlainRecord(patch)) {
		issues.push({ code: 'not-an-object', path: '' });
		return { issues, ok: false };
	}

	const confirmed: OptionalConsentCategory[] = [];
	const values = new Map<OptionalConsentCategory, boolean>();
	for (const key of ownKeys(patch)) {
		const value = patch[key];
		if (key === 'necessary') {
			if (value !== true) {
				issues.push({ code: 'invalid-boolean', path: key });
			}
			continue;
		}
		if (!isOptionalConsentCategory(key)) {
			issues.push({ code: 'unknown-key', path: key });
			continue;
		}
		if (typeof value !== 'boolean') {
			issues.push({ code: 'invalid-boolean', path: key });
			continue;
		}
		if (value && !options.policy.scope.includes(key)) {
			issues.push({ code: 'out-of-scope', path: key });
			continue;
		}
		values.set(key, value);
		confirmed.push(key);
	}

	if (issues.length > 0) {
		return { issues, ok: false };
	}

	const base = previous ?? EMPTY_CHOICE;
	if (values.size === 0) {
		return { choice: base, confirmed: [], ok: true };
	}

	const categories: ExplicitChoice['categories'] = { ...base.categories };
	for (const [key, value] of values) {
		categories[key] = {
			basis: {
				fingerprint: options.policy.choice.fingerprint,
				kind: 'choice-v1',
			},
			confirmedAt: options.actionAt,
			value,
		};
	}

	return { choice: { categories, version: 3 }, confirmed, ok: true };
};
