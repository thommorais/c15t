'use client'

import type { AuthRepository } from '_/features/auth/ports/repositories/auth-repository'
import { createContext, useContext } from 'react'

export type AuthContextValue = {
	authRepository: AuthRepository
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export const useAuthRepository = (): AuthRepository => {
	const context = useContext(AuthContext)

	if (!context) {
		throw new Error('useAuthRepository must be used within AuthProvider')
	}

	return context.authRepository
}
