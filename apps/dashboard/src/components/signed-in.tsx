import { useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useSession } from '../app/use-session'

const SignedIn = ({ children }: { children: React.ReactNode }) => {
	const session = useSession()
	const navigate = useNavigate()

	useEffect(() => {
		if (session.status === 'anonymous') {
			void navigate({ to: '/login', replace: true })
		}
	}, [session.status, navigate])

	if (session.status !== 'authenticated') {
		return <div className='bg-background min-h-dvh' />
	}

	return <>{children}</>
}

export { SignedIn }
