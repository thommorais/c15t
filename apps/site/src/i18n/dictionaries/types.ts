import type { locales } from './locales'
import { pt } from './pt'

type Locale = (typeof locales)[number]

type LocalesExtended = {
	[L in Locale]: {
		name: string
		direction: 'ltr' | 'rtl'
		file: `./${L}`
	}
}

type LocaleKey = keyof typeof pt

type Dictionary = {
	[key in LocaleKey]: string
}

type ExplicitDictionaries = {
	[L in Locale]: Dictionary
}

type DictionaryLoaders = {
	[L in Locale]: () => Promise<{ default: ExplicitDictionaries[L] }>
}

type LooseI18n = () => (key: LocaleKey, params?: Record<string, unknown>) => string

export type { LooseI18n, ExplicitDictionaries, Dictionary, DictionaryLoaders, Locale, LocalesExtended, LocaleKey }
