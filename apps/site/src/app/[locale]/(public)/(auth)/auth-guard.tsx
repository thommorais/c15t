'use client'

import { ROUTES } from '_/constants/routes'
import { useAuth } from '_/features/auth/ui/hooks/use-auth'
import { useRouter } from 'next/navigation'
import { type ComponentProps, useEffect } from 'react'

const AuthGuard = ({ children }: ComponentProps<'div'>) => {
	const { isAuthenticated, isInitializing } = useAuth()
	const router = useRouter()

	useEffect(() => {
		if (!isInitializing && isAuthenticated) {
			router.push(ROUTES.dashboard)
			return
		}
	}, [isAuthenticated, isInitializing, router])

	if (!isAuthenticated && isInitializing) {
		return null
	}

	if (!isInitializing && isAuthenticated) {
		return null
	}

	return children
}

export { AuthGuard }
