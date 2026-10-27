import type { ConsentState } from '../consent/compliance';
import type { AllConsentNames } from '../consent/consent-types';

export type HasCondition<CategoryType> =
	| CategoryType
	| { and: HasCondition<CategoryType> | HasCondition<CategoryType>[] }
	| { or: HasCondition<CategoryType> | HasCondition<CategoryType>[] }
	| { not: HasCondition<CategoryType> };

const validateNonEmptyConditions = function validateNonEmptyConditions<
	CategoryType,
>(
	conditions: CategoryType[] | HasCondition<CategoryType>[],
	conditionType: string
): void {
	if (conditions.length === 0) {
		throw new TypeError(`${conditionType} condition cannot be empty`);
	}
};

const evaluateCategoryCondition = function evaluateCategoryCondition(
	category: AllConsentNames,
	consents: ConsentState
): boolean {
	if (!(category in consents)) {
		throw new Error(
			`Consent category "${category}" not found in consent state`
		);
	}
	return consents[category] || false;
};

const evaluateConditionRecursive = function evaluateConditionRecursive<
	CategoryType extends AllConsentNames,
>(condition: HasCondition<CategoryType>, consents: ConsentState): boolean {
	if (typeof condition === 'string') {
		return evaluateCategoryCondition(condition, consents);
	}

	if (typeof condition === 'object' && condition !== null) {
		if ('and' in condition) {
			const andConditions = Array.isArray(condition.and)
				? condition.and
				: [condition.and];
			validateNonEmptyConditions(andConditions, 'AND');
			return andConditions.every((subCondition) =>
				evaluateConditionRecursive(subCondition, consents)
			);
		}

		if ('or' in condition) {
			const orConditions = Array.isArray(condition.or)
				? condition.or
				: [condition.or];
			validateNonEmptyConditions(orConditions, 'OR');
			return orConditions.some((subCondition) =>
				evaluateConditionRecursive(subCondition, consents)
			);
		}

		if ('not' in condition) {
			return !evaluateConditionRecursive(condition.not, consents);
		}
	}

	throw new TypeError(
		`Invalid condition structure: ${JSON.stringify(condition)}`
	);
};

export const has = function has<CategoryType extends AllConsentNames>(
	condition: HasCondition<CategoryType>,
	permissions: ConsentState
): boolean {
	return evaluateConditionRecursive(condition, permissions);
};

export const extractConsentNamesFromCondition =
	function extractConsentNamesFromCondition<
		CategoryType extends AllConsentNames,
	>(condition: HasCondition<CategoryType>): CategoryType[] {
		const categories = new Set<CategoryType>();

		const recurse = function recurse(cond: HasCondition<CategoryType>) {
			if (typeof cond === 'string') {
				categories.add(cond);
				return;
			}

			if (typeof cond === 'object' && cond !== null) {
				if ('and' in cond) {
					const conditions = Array.isArray(cond.and) ? cond.and : [cond.and];
					conditions.forEach(recurse);
				} else if ('or' in cond) {
					const conditions = Array.isArray(cond.or) ? cond.or : [cond.or];
					conditions.forEach(recurse);
				} else if ('not' in cond) {
					recurse(cond.not);
				}
			}
		};

		recurse(condition);
		return Array.from(categories);
	};
