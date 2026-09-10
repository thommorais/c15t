import { Logo } from '_/components/features/logo'
import type { Locale } from '_/i18n/dictionaries/types'
import { setStaticParamsLocale } from 'next-international/server'

type HomeProps = {
	params: Promise<{ locale: string }>
}

const Home = async ({ params }: HomeProps): Promise<React.ReactNode> => {
	const resolvedParams = await params
	const locale = resolvedParams.locale as Locale
	setStaticParamsLocale(locale)

	return (
		<main className='relative flex min-h-dvh w-full flex-col items-center justify-center'>
			<Logo className='h-16 w-auto' />
		</main>
	)
}

// oxlint-disable-next-line import/no-default-export -- page
export default Home
