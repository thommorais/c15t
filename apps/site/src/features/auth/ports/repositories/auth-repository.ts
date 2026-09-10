import type { AuthSession, Credentials, SignupData, User } from '_/features/auth/domain/types'
import type { Result } from '_/lib/result'

/**
 * Auth repository port (interface)
 * Defines the contract for authentication operations
 * All methods return Result<T> for error handling
 */
export type AuthRepository = {
	/**
	 * Initialize auth state by checking for existing session
	 * Returns current user if authenticated, null otherwise
	 */
	readonly initialize: () => Promise<Result<User | null>>

	/**
	 * Sign in with email and password
	 * Returns authenticated user and session data
	 */
	readonly signIn: (credentials: Credentials) => Promise<Result<AuthSession>>

	/**
	 * Sign up a new user
	 * Returns authenticated user and session data
	 */
	readonly signUp: (data: SignupData) => Promise<Result<AuthSession>>

	/**
	 * Sign out the current user
	 * Clears session and auth state
	 */
	readonly signOut: () => Promise<Result<void>>

	/**
	 * Get current authenticated user
	 * Returns null if not authenticated
	 */
	readonly getCurrentUser: () => Promise<Result<User | null>>

	/**
	 * Subscribe to auth state changes
	 * Callback is invoked whenever auth state changes
	 * Returns unsubscribe function
	 */
	readonly onAuthStateChange: (callback: (user: User | null) => void) => () => void
}
