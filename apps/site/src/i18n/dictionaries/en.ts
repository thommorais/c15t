import type { LocaleKey } from '_/i18n/dictionaries/types'

const en: {
	[key in LocaleKey]: string
} = {
	name: 'name',
	// auth
	sign_out: 'sign out',
} as const

export { en }
