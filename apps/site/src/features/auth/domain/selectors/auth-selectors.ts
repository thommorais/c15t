import type { AuthState, User } from '_/features/auth/domain/types'

/**
 * Gets current user from auth state
 * @pure
 */
export const getUser = (state: AuthState): User | null => {
	return state.type === 'authenticated' ? state.user : null
}

/**
 * Checks if user is authenticated
 * @pure
 */
export const isAuthenticated = (state: AuthState): boolean => {
	return state.type === 'authenticated'
}

/**
 * Gets error from auth state
 * @pure
 */
export const getError = (state: AuthState): string | null => {
	return state.type === 'error' ? state.error : null
}

/**
 * Checks if auth is initializing
 * @pure
 */
export const isInitializing = (state: AuthState): boolean => {
	return state.type === 'initializing'
}

/**
 * Checks if there's an error
 * @pure
 */
export const hasError = (state: AuthState): boolean => {
	return state.type === 'error'
}
