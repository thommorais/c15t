import type { Locale } from '_/i18n/dictionaries/types'
import { tv } from '_/lib/third-party/tv'
import type { LayoutProps } from '_/types/pages-layouts'
import { Jost } from 'next/font/google'

// const cascadiaMono = Cascadia_Mono({
// 	display: 'swap',
// 	variable: '--font-accent',
// })

const jost = Jost({
	subsets: ['latin'],
	display: 'swap',
	variable: '--font-default',
})

export const htmlClasses = tv({
	base: [
		// cascadiaMono.variable,
		jost.variable,
		'bg-porcelain font-default text-primary-900 accent-accent ease-enter selection:bg-primary-400 min-h-dvh w-full max-w-screen overscroll-none antialiased transition-colors transition-discrete duration-200',
	],
})

type HTMLProps = Pick<LayoutProps, 'children'> &
	React.ComponentProps<'html'> & {
		locale: Locale
	}

const HTML = ({ children, locale, className }: HTMLProps): React.ReactNode => {
	return (
		<html lang={locale} className={htmlClasses({ class: [className] })}>
			{children}
		</html>
	)
}

export { HTML }
