import { translations as enTranslations } from './translations/en';
import type { Translations } from './types';

const REGISTRY_KEY = Symbol.for('c15t.stockTranslations');

type StockRegistry = Map<string, Translations>;

const getRegistry = function getRegistry(): StockRegistry {
	const holder = globalThis as typeof globalThis & {
		[REGISTRY_KEY]?: StockRegistry;
	};
	holder[REGISTRY_KEY] ??= new Map([['en', enTranslations]]);
	return holder[REGISTRY_KEY];
};

export const registerStockTranslations = function registerStockTranslations(
	translations: Readonly<Record<string, Translations>>
): void {
	const registry = getRegistry();
	for (const [language, copy] of Object.entries(translations)) {
		registry.set(language, copy);
	}
};

export const getStockTranslations = function getStockTranslations(
	language: string
): Translations | undefined {
	return getRegistry().get(language);
};
