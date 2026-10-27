import { Button } from '@journ/bloom/button'
import { createFileRoute, Outlet } from '@tanstack/react-router'
import { useSession, useSignOut } from '../app/use-session'
import { SignedIn } from '../components/signed-in'

const Header = () => {
	const session = useSession()
	const signOut = useSignOut()

	return (
		<header className='border-border flex items-center justify-between border-b px-6 py-3'>
			<span className='font-serif text-lg'>c15t</span>
			<div className='flex items-center gap-4'>
				{session.status === 'authenticated' && <span className='text-dim text-sm'>{session.operator.email}</span>}
				<Button tone='ghost' onClick={signOut}>
					Sign out
				</Button>
			</div>
		</header>
	)
}

const AuthenticatedLayout = () => (
	<SignedIn>
		<Header />
		<Outlet />
	</SignedIn>
)

export const Route = createFileRoute('/_authenticated')({
	component: AuthenticatedLayout,
})
