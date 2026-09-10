'use client'

import { Button } from '@thom/ui/button'
import { useChangeLocale, useCurrentLocale } from '_/i18n/config-client'
import { locales } from '_/i18n/dictionaries/locales'
import type { Locale } from '_/i18n/dictionaries/types'

const localeLabels: Record<Locale, string> = {
	en: 'EN',
	pt: 'PT',
}

export const LocaleSwitcher = () => {
	const currentLocale = useCurrentLocale()
	const changeLocale = useChangeLocale()
	const targetLocale: Locale | undefined = locales.find(locale => locale !== currentLocale)

	if (!targetLocale) {
		return null
	}

	return (
		<Button
			type='button'
			variant='ghost'
			size='sm'
			className='text-primary-900 lowercase'
			onClick={() => {
				if (targetLocale && targetLocale !== currentLocale) {
					changeLocale(targetLocale)
				}
			}}
		>
			{localeLabels[targetLocale]}
		</Button>
	)
}
