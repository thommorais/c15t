import type { TranslationConfig, Translations } from '@c15t/translations';
import {
	deepMergeTranslations,
	enTranslations,
	getStockTranslations,
	migrateLegacyTranslationKeys,
} from '@c15t/translations';

import type { KernelTranslations } from '../types';

export const defaultTranslationConfig: TranslationConfig = {
	defaultLanguage: 'en',
	disableAutoLanguageSwitch: false,
	translations: {
		en: enTranslations,
	},
};

export type TranslationOverrides = Readonly<
	Record<string, Partial<Translations> | undefined>
>;

export const selectTranslationOverride = function selectTranslationOverride(
	overrides: TranslationOverrides | undefined,
	language: string
): Partial<Translations> | undefined {
	if (!overrides) {
		return undefined;
	}
	const exact = Object.hasOwn(overrides, language)
		? overrides[language]
		: undefined;
	if (exact) {
		return exact;
	}
	const primary = language.split('-')[0]?.toLowerCase();
	if (primary && primary !== language && Object.hasOwn(overrides, primary)) {
		return overrides[primary];
	}
	return undefined;
};

type TranslationTree = Readonly<Record<string, unknown>>;

const isTree = function isTree(value: unknown): value is TranslationTree {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const sameLeaf = function sameLeaf(left: unknown, right: unknown): boolean {
	if (left === right) {
		return true;
	}
	return (
		Array.isArray(left) &&
		Array.isArray(right) &&
		JSON.stringify(left) === JSON.stringify(right)
	);
};

const pickEffectiveOverride = function pickEffectiveOverride(
	override: TranslationTree,
	stock: TranslationTree | undefined,
	base: TranslationTree | undefined
): Record<string, unknown> | undefined {
	const picked: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(override)) {
		if (value === undefined) {
			continue;
		}
		const stockValue = stock?.[key];
		const baseValue = base?.[key];
		if (isTree(value)) {
			const nested = pickEffectiveOverride(
				value,
				isTree(stockValue) ? stockValue : undefined,
				isTree(baseValue) ? baseValue : undefined
			);
			if (nested) {
				picked[key] = nested;
			}
		} else if (baseValue === undefined || !sameLeaf(value, stockValue)) {
			picked[key] = value;
		}
	}
	return Object.keys(picked).length > 0 ? picked : undefined;
};

const findStockTranslations = function findStockTranslations(
	language: string
): Translations | undefined {
	const primary = language.split('-')[0]?.toLowerCase();
	return (
		getStockTranslations(language) ??
		(primary ? getStockTranslations(primary) : undefined)
	);
};

export const applyTranslationOverrides = function applyTranslationOverrides(
	resolved: KernelTranslations,
	overrides: TranslationOverrides | undefined
): KernelTranslations {
	const migrated = migrateLegacyTranslationKeys(
		resolved.translations as Partial<Translations>
	);
	const translations: KernelTranslations =
		migrated === resolved.translations
			? resolved
			: {
					...resolved,
					translations: migrated as KernelTranslations['translations'],
				};
	const legacySelected = selectTranslationOverride(
		overrides,
		translations.language
	);
	if (!legacySelected) {
		return translations;
	}
	const selected = migrateLegacyTranslationKeys(legacySelected);
	const effective = pickEffectiveOverride(
		selected as TranslationTree,
		findStockTranslations(translations.language) as TranslationTree | undefined,
		translations.translations as TranslationTree
	);
	if (!effective) {
		return translations;
	}
	return {
		...translations,
		translations: {
			...translations.translations,
			...deepMergeTranslations(
				translations.translations as Translations,
				effective as Partial<Translations>
			),
		} as KernelTranslations['translations'],
	};
};

export const resolveLocalTranslations = function resolveLocalTranslations(
	language: string,
	overrides: TranslationOverrides | undefined
): KernelTranslations | undefined {
	const bundled = findStockTranslations(language);
	const selected = selectTranslationOverride(overrides, language);
	if (!(bundled || selected)) {
		return undefined;
	}
	const base = bundled ?? enTranslations;
	return {
		language,
		translations: (selected
			? deepMergeTranslations(base, selected)
			: base) as KernelTranslations['translations'],
	};
};
