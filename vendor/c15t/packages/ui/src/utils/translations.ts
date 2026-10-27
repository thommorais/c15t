import type { TranslationConfig, Translations } from '@c15t/core';

export const isTranslations = function isTranslations(
	value: unknown
): value is Translations {
	if (!value || typeof value !== 'object') {
		return false;
	}

	const obj = value as Record<string, unknown>;
	const hasRequiredKeys =
		'cookieBanner' in obj &&
		'consentManagerDialog' in obj &&
		'consentTypes' in obj &&
		'common' in obj;

	return hasRequiredKeys;
};

export const resolveTranslations = function resolveTranslations(
	translationConfig: Partial<TranslationConfig>,
	defaultTranslationConfig: TranslationConfig
): Translations {
	const { translations = {}, defaultLanguage = 'en' } = translationConfig;

	const selectedTranslations = translations[defaultLanguage];
	if (isTranslations(selectedTranslations)) {
		return selectedTranslations;
	}

	const englishTranslations = translations.en;
	if (isTranslations(englishTranslations)) {
		return englishTranslations;
	}

	return defaultTranslationConfig.translations.en as Translations;
};
