import { Button } from '@thom/ui/button'
import { HTML } from '_/components/ui/html'
import { LOCAL_HREFS } from '_/constants'
import { defaultLocale } from '_/i18n/dictionaries/locales'

function NotFound() {
	return (
		<HTML locale={defaultLocale}>
			<body>
				<main className='flex min-h-dvh flex-col justify-center px-12 lg:px-24'>
					<div className='mx-auto my-auto max-w-3xl py-12 text-center lg:py-24'>
						<p className='text-base font-semibold text-indigo-300'>404</p>
						<div className='mt-10 flex items-center justify-center gap-x-6'>
							<Button variant='outline' href={LOCAL_HREFS.HOME}>
								<span>Back</span>
							</Button>
						</div>
					</div>
				</main>
			</body>
		</HTML>
	)
}

// oxlint-disable-next-line import/no-default-export -- page
export default NotFound
