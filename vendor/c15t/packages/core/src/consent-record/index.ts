export { evaluateConsentRecord } from './evaluate';
export type { ConsentEvaluationInput } from './evaluate';
export {
	canonicalizeCategories,
	createEvaluationPolicy,
} from './evaluation-policy';
export type { EvaluationPolicyInput } from './evaluation-policy';
export { normalizeLegacyConsentRecord } from './normalize';
export type {
	LegacyRecordEncoding,
	NormalizeLegacyOptions,
	NormalizeLegacyResult,
} from './normalize';
export { recordCategoryPatch } from './record';
export type { RecordPatchOptions, RecordPatchResult } from './record';
export { CONSENT_CATEGORIES, OPTIONAL_CONSENT_CATEGORIES } from './types';
export type {
	CategoryDecision,
	CategoryEvaluation,
	ChoiceBasis,
	CONSENT_CATEGORY,
	ConsentCategory,
	ConsentEvaluation,
	ConsentSubject,
	DecisionAuthority,
	EvaluationPolicy,
	ExplicitChoice,
	NoticeDismissal,
	OptionalConsentCategory,
	PermissionSource,
	PolicyModel,
	PolicyPrompt,
	PromptReason,
	PromptRequirement,
	RecordValidity,
	RestrictionReason,
} from './types';
export {
	isOptionalConsentCategory,
	validateExplicitChoice,
	validateNoticeDismissal,
} from './validation';
export type { RecordIssue, ValidationResult } from './validation';
