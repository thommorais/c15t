import { getPocketBaseClient, getPocketBaseFileUrl } from '_/data/pocketbase-client'
import type { AuthSession, Credentials, SignupData, User } from '_/features/auth/domain/types'
import { authToken, email, timestamp, userId } from '_/features/auth/domain/types'
import type { AuthRepository } from '_/features/auth/ports/repositories/auth-repository'
import type { Result } from '_/lib/result'
import { err, ok } from '_/lib/result'
import type { UsersResponse } from '_/types/pocketbase-types'
import { Collections } from '_/types/pocketbase-types'

const mapToUser = (pbUser: UsersResponse): User => {
	return {
		id: userId(pbUser.id),
		email: email(pbUser.email),
		name: pbUser.name ?? null,
		avatar: getPocketBaseFileUrl(Collections.Users, pbUser.id, pbUser.avatar),
		emailVisibility: pbUser.emailVisibility ?? false,
		verified: pbUser.verified ?? false,
		createdAt: timestamp(new Date(pbUser.created).getTime()),
		updatedAt: timestamp(new Date(pbUser.updated).getTime()),
	}
}

const loginVerificationError = new Error('Email verification required.')
const signupVerificationError = new Error('Account created. Verify your email before signing in.')

/**
 * Creates a PocketBase-backed implementation of AuthRepository
 */
export const createPocketBaseAuthRepository = (): AuthRepository => {
	const client = getPocketBaseClient()

	// Store auth state change listeners
	const listeners = new Set<(user: User | null) => void>()

	// Notify all listeners of auth state change
	const notifyListeners = (user: User | null) => {
		for (const callback of listeners) {
			callback(user)
		}
	}

	const clearUnverifiedSession = () => {
		client.authStore.clear()
		notifyListeners(null)
	}

	return {
		initialize: async (): Promise<Result<User | null>> => {
			try {
				// Check if there's a valid auth token in storage
				if (!client.authStore.isValid) {
					return ok(null)
				}

				const currentUser = client.authStore.record
				if (!currentUser) {
					return ok(null)
				}

				// Map to domain model
				const user = mapToUser(currentUser as UsersResponse)
				if (!user.verified) {
					clearUnverifiedSession()
					return ok(null)
				}
				notifyListeners(user)
				return ok(user)
			} catch (error) {
				return err(new Error(`Failed to initialize auth: ${error instanceof Error ? error.message : 'Unknown error'}`))
			}
		},

		signIn: async (credentials: Credentials): Promise<Result<AuthSession>> => {
			try {
				const authData = await client
					.collection(Collections.Users)
					.authWithPassword(credentials.email, credentials.password)

				const user = mapToUser(authData.record as UsersResponse)
				const token = authToken(authData.token)

				if (!user.verified) {
					clearUnverifiedSession()
					return err(loginVerificationError)
				}

				notifyListeners(user)

				return ok({
					user,
					token,
				})
			} catch (error) {
				return err(new Error(`Sign in failed: ${error instanceof Error ? error.message : 'Invalid credentials'}`))
			}
		},

		signUp: async (data: SignupData): Promise<Result<AuthSession>> => {
			try {
				// Create the user account
				await client.collection(Collections.Users).create({
					email: data.email,
					password: data.password,
					passwordConfirm: data.password,
					name: data.name,
				})

				// Authenticate the newly created user
				const authData = await client.collection(Collections.Users).authWithPassword(data.email, data.password)

				const user = mapToUser(authData.record as UsersResponse)
				const token = authToken(authData.token)

				if (!user.verified) {
					clearUnverifiedSession()
					return err(signupVerificationError)
				}

				notifyListeners(user)

				return ok({
					user,
					token,
				})
			} catch (error) {
				return err(new Error(`Sign up failed: ${error instanceof Error ? error.message : 'Unable to create account'}`))
			}
		},

		signOut: async (): Promise<Result<void>> => {
			try {
				client.authStore.clear()
				notifyListeners(null)
				return ok(undefined)
			} catch (error) {
				return err(new Error(`Sign out failed: ${error instanceof Error ? error.message : 'Unknown error'}`))
			}
		},

		getCurrentUser: async (): Promise<Result<User | null>> => {
			try {
				if (!client.authStore.isValid) {
					return ok(null)
				}

				const currentUser = client.authStore.record
				if (!currentUser) {
					return ok(null)
				}

				const user = mapToUser(currentUser as UsersResponse)
				if (!user.verified) {
					clearUnverifiedSession()
					return ok(null)
				}

				return ok(user)
			} catch (error) {
				return err(new Error(`Failed to get current user: ${error instanceof Error ? error.message : 'Unknown error'}`))
			}
		},

		onAuthStateChange: (callback: (user: User | null) => void) => {
			listeners.add(callback)

			// Return unsubscribe function
			return () => {
				listeners.delete(callback)
			}
		},
	}
}
