'use client'

import { Button } from '@thom/ui/button'
import { useAuth } from '_/features/auth/ui/hooks/use-auth'
import { useRouter } from 'next/navigation'

type LogoutButtonProps = {
	className?: string
}

export const LogoutButton = ({ className }: LogoutButtonProps) => {
	const { signOut } = useAuth()
	const router = useRouter()

	const handleLogout = async () => {
		const result = await signOut()
		if (result.success) {
			router.push('/login')
		}
	}

	return (
		<Button onClick={handleLogout} className={className} size='sm' variant='ghost' color='danger'>
			Sign Out
		</Button>
	)
}
