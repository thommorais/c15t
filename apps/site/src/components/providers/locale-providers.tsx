import { I18nProviderClient } from '_/i18n/config-client'
import type { Locale } from '_/i18n/dictionaries/types'

type Props = {
	locale: Locale
	children: React.ReactNode
}

const LocaleProviders = ({ locale, children }: Props) => {
	return <I18nProviderClient locale={locale}>{children}</I18nProviderClient>
}

export { LocaleProviders }
