'use client'

import { createPocketBaseAuthRepository } from '_/features/auth/adapters/repositories/pocketbase-auth-repository'
import type { AuthRepository } from '_/features/auth/ports/repositories/auth-repository'
import { AuthContext } from '_/features/auth/ui/contexts/auth-context'
import { useMemo } from 'react'

type AuthProviderProps = {
	children: React.ReactNode
	repository?: AuthRepository // Allow injecting repository for testing
}

export const AuthProvider = ({ children, repository }: AuthProviderProps) => {
	const authRepository = useMemo(() => repository ?? createPocketBaseAuthRepository(), [repository])

	const value = useMemo(
		() => ({
			authRepository,
		}),
		[authRepository],
	)

	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
