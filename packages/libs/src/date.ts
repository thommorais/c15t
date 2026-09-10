import * as chrono from 'chrono-node'
import { format, type Locale } from 'date-fns'
import { enUS, ptBR } from 'date-fns/locale'

export type DateLocale = 'en-US' | 'en' | 'pt-BR' | 'pt'

const DATE_FNS_LOCALE: Record<DateLocale, Locale> = {
	'en-US': enUS,
	'pt-BR': ptBR,
	en: enUS,
	pt: ptBR,
}

const resolveDateFnsLocale = (language?: DateLocale | null): Locale =>
	(language ? DATE_FNS_LOCALE[language] : undefined) ?? enUS

const toCalendarDate = (ms: number): Date => {
	const stored = new Date(ms)
	return new Date(stored.getUTCFullYear(), stored.getUTCMonth(), stored.getUTCDate())
}

const formatCalendarDate = (ms: number, language?: DateLocale | null, pattern = 'PP'): string =>
	format(toCalendarDate(ms), pattern, { locale: resolveDateFnsLocale(language) })

const formatDate = (ms: number, language?: DateLocale | null, pattern = 'yyyy-MM-dd'): string =>
	format(new Date(ms), pattern, { locale: resolveDateFnsLocale(language) })

const weekdayShortLabels = (locale: DateLocale) => {
	return Array.from({ length: 7 }, (_, index) => {
		const date = new Date(Date.UTC(2024, 0, 7 + index)) // 2024-01-07 is a Sunday
		return date.toLocaleDateString(locale, { weekday: 'short', timeZone: 'UTC' })
	})
}

type ParsedDate = Date | string

const localeMap = {
	'en-US': chrono.en,
	en: chrono.en,
	'pt-BR': chrono.pt,
	pt: chrono.pt,
}

const parseDate = <V extends string>(value: V, locale: DateLocale): ParsedDate | V | null => {
	if (!value.trim()) {
		return value
	}

	const parsed = (localeMap[locale] || chrono.en).parseDate(value.trim(), {
		timezone: 'UTC',
	})

	return parsed ?? null
}

export { parseDate, resolveDateFnsLocale, formatDate, formatCalendarDate, toCalendarDate, weekdayShortLabels }
