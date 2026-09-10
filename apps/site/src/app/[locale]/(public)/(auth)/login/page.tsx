import { LoginPage } from '_/features/auth/ui/pages/login-page'
import type { Locale } from '_/i18n/dictionaries/types'
import { setStaticParamsLocale } from 'next-international/server'

type LoginProps = {
	params: Promise<{ locale: string }>
}

const Login = async ({ params }: LoginProps) => {
	const resolvedParams = await params
	const locale = resolvedParams.locale as Locale
	setStaticParamsLocale(locale)

	return <LoginPage />
}

// oxlint-disable-next-line import/no-default-export -- page
export default Login
