import { compareCanonical } from '@c15t/schema/types';

import type {
	EvaluationPolicy,
	OptionalConsentCategory,
	PolicyModel,
	PolicyPrompt,
	RecordValidity,
} from './types';
import { isNonEmptyString, isOptionalConsentCategory } from './validation';

export interface EvaluationPolicyInput {
	model: PolicyModel;
	prompt: PolicyPrompt;
	scope: readonly OptionalConsentCategory[];
	scopeMode: 'strict' | 'permissive';
	choiceScope?: readonly OptionalConsentCategory[];
	choice: RecordValidity;
	notice: RecordValidity;
	gpcDenyCategories?: readonly OptionalConsentCategory[];
	legacyMaterialFingerprint?: string | null;
}

export const canonicalizeCategories = function canonicalizeCategories<
	CategoryType extends string,
>(categories: readonly CategoryType[]): CategoryType[] {
	return [...new Set(categories)].sort(compareCanonical);
};

const assertPromptForModel = function assertPromptForModel(
	model: PolicyModel,
	prompt: PolicyPrompt
): void {
	if (
		model !== 'opt-in' &&
		model !== 'opt-out' &&
		model !== 'iab' &&
		model !== 'none'
	) {
		throw new TypeError(`Unknown policy model "${model}"`);
	}
	if (prompt !== 'choice' && prompt !== 'notice' && prompt !== 'none') {
		throw new TypeError(`Unknown policy prompt "${prompt}"`);
	}
	if (model === 'none') {
		if (prompt !== 'none') {
			throw new TypeError(
				`Policy model "none" requires prompt "none", received "${prompt}"`
			);
		}
		return;
	}
	if (model !== 'opt-out' && prompt !== 'choice') {
		throw new TypeError(
			`Policy model "${model}" requires prompt "choice", received "${prompt}"`
		);
	}
};

const normalizeValidity = function normalizeValidity(
	validity: RecordValidity,
	name: string
): RecordValidity {
	const { fingerprint, maxAgeMs } = validity;
	if (!isNonEmptyString(fingerprint)) {
		throw new TypeError(`${name}.fingerprint must be a non-empty string`);
	}
	if (maxAgeMs !== null && !(Number.isFinite(maxAgeMs) && maxAgeMs >= 0)) {
		throw new TypeError(
			`${name}.maxAgeMs must be null or a finite non-negative number`
		);
	}
	return { fingerprint, maxAgeMs };
};

const assertScope = function assertScope(scope: readonly string[]): void {
	for (const category of scope) {
		if (!isOptionalConsentCategory(category)) {
			throw new TypeError(`Scope has unknown category "${category}"`);
		}
	}
};

const assertGpcMapping = function assertGpcMapping(
	mapping: readonly string[],
	scope: readonly OptionalConsentCategory[]
): void {
	const seen = new Set<string>();
	for (const category of mapping) {
		if (category === 'necessary') {
			throw new TypeError('GPC mapping cannot deny "necessary"');
		}
		if (!isOptionalConsentCategory(category)) {
			throw new TypeError(`GPC mapping has unknown category "${category}"`);
		}
		if (seen.has(category)) {
			throw new TypeError(`GPC mapping repeats category "${category}"`);
		}
		if (!scope.includes(category)) {
			throw new TypeError(
				`GPC mapping category "${category}" is outside the policy scope`
			);
		}
		seen.add(category);
	}
};

export const createEvaluationPolicy = function createEvaluationPolicy(
	input: EvaluationPolicyInput
): EvaluationPolicy {
	const { model, prompt, scopeMode } = input;
	const legacyMaterialFingerprint = input.legacyMaterialFingerprint ?? null;
	assertPromptForModel(model, prompt);
	if (scopeMode !== 'strict' && scopeMode !== 'permissive') {
		throw new TypeError(`Unknown policy scope mode "${scopeMode}"`);
	}
	if (
		legacyMaterialFingerprint !== null &&
		!isNonEmptyString(legacyMaterialFingerprint)
	) {
		throw new TypeError(
			'legacyMaterialFingerprint must be null or a non-empty string'
		);
	}
	const choice = normalizeValidity(input.choice, 'choice');
	const notice = normalizeValidity(input.notice, 'notice');
	assertScope(input.scope);
	const scope = canonicalizeCategories(input.scope);
	const { choiceScope } = input;
	if (choiceScope) {
		assertScope(choiceScope);
		if (choiceScope.some((category) => !scope.includes(category))) {
			throw new TypeError('Choice scope must be inside the policy scope');
		}
	}
	const gpcDenyCategories = input.gpcDenyCategories ?? [];
	assertGpcMapping(gpcDenyCategories, scope);

	const policy: EvaluationPolicy = {
		choice,
		gpcDenyCategories: canonicalizeCategories(gpcDenyCategories),
		legacyMaterialFingerprint,
		model,
		notice,
		prompt,
		scope,
		scopeMode,
	};
	if (choiceScope) {
		policy.choiceScope = canonicalizeCategories(choiceScope);
	}
	return policy;
};
