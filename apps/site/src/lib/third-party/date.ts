import dayjs from 'dayjs'
import localizedFormat from 'dayjs/plugin/localizedFormat'
import 'dayjs/locale/en'
import 'dayjs/locale/pt'

import { defaultLocale } from '_/i18n/dictionaries/locales'
import type { Locale } from '_/i18n/dictionaries/types'

dayjs.extend(localizedFormat)

const dayjsLocales: Record<Locale, string> = {
	en: 'en',
	pt: 'pt',
}

let activeLocale: string | undefined

const setDateLocale = (locale: Locale) => {
	const nextLocale = dayjsLocales[locale] ?? dayjsLocales[defaultLocale]
	if (activeLocale === nextLocale) {
		return
	}
	dayjs.locale(nextLocale)
	activeLocale = nextLocale
}

const formatMsToDDMMYYYY = (ms: number) => {
	return dayjs(ms).format('DD.MM.YY')
}

export { dayjs as date, formatMsToDDMMYYYY, setDateLocale }
export type { Dayjs } from 'dayjs'
