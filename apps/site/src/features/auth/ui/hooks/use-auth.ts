'use client'

import { createInitialAuthState, reduceAuthState } from '_/features/auth/domain/reducers/auth-reducer'
import * as selectors from '_/features/auth/domain/selectors/auth-selectors'
import type { Credentials, SignupData, User } from '_/features/auth/domain/types'
import { useAuthRepository } from '_/features/auth/ui/contexts/auth-context'
import { ok, type Result } from '_/lib/result'
import { useCallback, useEffect, useReducer } from 'react'

export type UseAuthReturn = {
	// State
	user: User | null
	isAuthenticated: boolean
	isInitializing: boolean
	error: string | null

	// Actions
	signIn: (credentials: Credentials) => Promise<Result<void>>
	signUp: (data: SignupData) => Promise<Result<void>>
	signOut: () => Promise<Result<void>>
}

/**
 * Main auth hook - orchestrates domain state + repository
 * Following hexagonal architecture:
 * - State managed by pure domain reducer
 * - Repository calls through port interface
 * - Returns domain models only
 */
export const useAuth = (): UseAuthReturn => {
	const authRepository = useAuthRepository()
	const [authState, dispatch] = useReducer(reduceAuthState, createInitialAuthState())

	// Initialize auth state on mount
	useEffect(() => {
		const initialize = async () => {
			dispatch({ type: 'INITIALIZATION_STARTED' })

			const result = await authRepository.initialize()

			if (!result.success) {
				dispatch({ type: 'AUTH_ERROR', error: result.error.message })
				return
			}

			if (result.data) {
				dispatch({ type: 'USER_LOADED', user: result.data })
			} else {
				dispatch({ type: 'SIGN_OUT_SUCCEEDED' })
			}
		}

		initialize()
	}, [authRepository])

	// Subscribe to auth state changes
	useEffect(() => {
		const unsubscribe = authRepository.onAuthStateChange(user => {
			if (user) {
				dispatch({ type: 'USER_LOADED', user })
			} else {
				dispatch({ type: 'SIGN_OUT_SUCCEEDED' })
			}
		})

		return unsubscribe
	}, [authRepository])

	const signIn = useCallback(
		async (credentials: Credentials): Promise<Result<void>> => {
			dispatch({ type: 'SIGN_IN_STARTED' })

			const result = await authRepository.signIn(credentials)

			if (result.success) {
				dispatch({ type: 'SIGN_IN_SUCCEEDED', user: result.data.user })
				return ok(undefined)
			}

			dispatch({ type: 'SIGN_IN_FAILED', error: result.error.message })
			return { success: false, error: result.error }
		},
		[authRepository],
	)

	const signUp = useCallback(
		async (data: SignupData): Promise<Result<void>> => {
			dispatch({ type: 'SIGN_IN_STARTED' })

			const result = await authRepository.signUp(data)

			if (result.success) {
				dispatch({ type: 'SIGN_IN_SUCCEEDED', user: result.data.user })
				return ok(undefined)
			}

			dispatch({ type: 'SIGN_IN_FAILED', error: result.error.message })
			return { success: false, error: result.error }
		},
		[authRepository],
	)

	const signOut = useCallback(async (): Promise<Result<void>> => {
		dispatch({ type: 'SIGN_OUT_STARTED' })

		const result = await authRepository.signOut()

		if (result.success) {
			dispatch({ type: 'SIGN_OUT_SUCCEEDED' })
			return ok(undefined)
		}

		dispatch({ type: 'SIGN_OUT_FAILED', error: result.error.message })
		return { success: false, error: result.error }
	}, [authRepository])

	return {
		user: selectors.getUser(authState),
		isAuthenticated: selectors.isAuthenticated(authState),
		isInitializing: selectors.isInitializing(authState),
		error: selectors.getError(authState),
		signIn,
		signUp,
		signOut,
	}
}
