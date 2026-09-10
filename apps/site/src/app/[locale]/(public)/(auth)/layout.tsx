import { Card } from '@thom/ui/card'
import { Logo } from '_/components/features/logo'
import { Container } from '_/components/ui/container'
import { AuthGuard } from './auth-guard'

type LocaleLayoutProps = {
	children: React.ReactNode
}

const AuthLayout = async ({ children }: LocaleLayoutProps) => {
	return (
		<Container asChild className='container mx-auto min-h-dvh grid-rows-1 place-items-center'>
			<main className='mx-auto w-full max-w-sm px-1 sm:max-w-lg'>
				<AuthGuard>
					<Card className='w-full space-y-12 py-8'>
						<Logo className='row-start-1 mx-auto h-16 w-auto' />
						{children}
					</Card>
				</AuthGuard>
			</main>
		</Container>
	)
}

// oxlint-disable-next-line import/no-default-export -- layout
export default AuthLayout
