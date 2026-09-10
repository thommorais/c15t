import type { Locale } from '_/i18n/dictionaries/types'
import type { Metadata } from 'next'
import { setStaticParamsLocale } from 'next-international/server'

export const metadata: Metadata = {
	title: 'Categories',
	description: 'Browse flashcard categories',
}

type PageProps = {
	params: Promise<{ locale: string }>
}

const Page = async ({ params }: PageProps) => {
	const resolvedParams = await params
	const locale = resolvedParams.locale as Locale
	setStaticParamsLocale(locale)

	return <div />
}

// oxlint-disable-next-line import/no-default-export -- page
export default Page
