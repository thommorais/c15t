import type { AuthEvent, AuthState } from '_/features/auth/domain/types'

/**
 * Pure reducer for auth state transitions
 * Uses discriminated unions for exhaustive pattern matching
 * @pure
 */
export const reduceAuthState = (state: AuthState, event: AuthEvent): AuthState => {
	switch (event.type) {
		case 'INITIALIZATION_STARTED':
			return { type: 'initializing' }

		case 'USER_LOADED':
			return {
				type: 'authenticated',
				user: event.user,
			}

		case 'SIGN_IN_STARTED':
			return state.type === 'unauthenticated' ? state : { type: 'unauthenticated' }

		case 'SIGN_IN_SUCCEEDED':
			return {
				type: 'authenticated',
				user: event.user,
			}

		case 'SIGN_IN_FAILED':
			return {
				type: 'error',
				error: event.error,
			}

		case 'SIGN_OUT_STARTED':
			return state

		case 'SIGN_OUT_SUCCEEDED':
			return { type: 'unauthenticated' }

		case 'SIGN_OUT_FAILED':
			return {
				type: 'error',
				error: event.error,
			}

		case 'AUTH_ERROR':
			return {
				type: 'error',
				error: event.error,
			}

		default: {
			const _exhaustive: never = event
			return state
		}
	}
}

/**
 * Creates initial auth state
 * @pure
 */
export const createInitialAuthState = (): AuthState => ({
	type: 'initializing',
})
