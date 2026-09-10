import type { LocaleKey } from '_/i18n/dictionaries/types'

export type UserId = string & { readonly __brand: 'UserId' }
export type AuthToken = string & { readonly __brand: 'AuthToken' }
export type Email = string & { readonly __brand: 'Email' }
export type Timestamp = number & { readonly __brand: 'Timestamp' }

export const userId = (id: string): UserId => id as UserId
export const authToken = (token: string): AuthToken => token as AuthToken
export const email = (value: string): Email => value as Email
export const timestamp = (value: number): Timestamp => value as Timestamp

export type User = {
	readonly id: UserId
	readonly email: Email
	readonly name: string | null
	readonly avatar: string | null
	readonly emailVisibility: boolean
	readonly verified: boolean
	readonly createdAt: Timestamp
	readonly updatedAt: Timestamp
}

export type AuthState =
	| { readonly type: 'initializing' }
	| { readonly type: 'unauthenticated' }
	| { readonly type: 'authenticated'; readonly user: User }
	| { readonly type: 'error'; readonly error: string }

export type LoginFormState = {
	readonly email: string
	readonly password: string
	readonly errors: LoginFormErrors
	readonly isSubmitting: boolean
	readonly submitError: string | null
}

export type LoginFormErrors = {
	readonly email?: LocaleKey
	readonly password?: LocaleKey
}

export type SignupFormState = {
	readonly email: string
	readonly password: string
	readonly confirmPassword: string
	readonly name: string
	readonly errors: SignupFormErrors
	readonly isSubmitting: boolean
	readonly submitError: string | null
}

export type SignupFormErrors = {
	readonly email?: LocaleKey
	readonly password?: LocaleKey
	readonly confirmPassword?: LocaleKey
	readonly name?: LocaleKey
}

export type AuthEvent =
	| { readonly type: 'INITIALIZATION_STARTED' }
	| { readonly type: 'USER_LOADED'; readonly user: User }
	| { readonly type: 'SIGN_IN_STARTED' }
	| { readonly type: 'SIGN_IN_SUCCEEDED'; readonly user: User }
	| { readonly type: 'SIGN_IN_FAILED'; readonly error: string }
	| { readonly type: 'SIGN_OUT_STARTED' }
	| { readonly type: 'SIGN_OUT_SUCCEEDED' }
	| { readonly type: 'SIGN_OUT_FAILED'; readonly error: string }
	| { readonly type: 'AUTH_ERROR'; readonly error: string }

export type LoginFormEvent =
	| { readonly type: 'EMAIL_CHANGED'; readonly email: string }
	| { readonly type: 'PASSWORD_CHANGED'; readonly password: string }
	| { readonly type: 'VALIDATION_FAILED'; readonly errors: LoginFormErrors }
	| { readonly type: 'SUBMIT_STARTED' }
	| { readonly type: 'SUBMIT_SUCCEEDED' }
	| { readonly type: 'SUBMIT_FAILED'; readonly error: string }

export type SignupFormEvent =
	| { readonly type: 'EMAIL_CHANGED'; readonly email: string }
	| { readonly type: 'PASSWORD_CHANGED'; readonly password: string }
	| { readonly type: 'CONFIRM_PASSWORD_CHANGED'; readonly confirmPassword: string }
	| { readonly type: 'NAME_CHANGED'; readonly name: string }
	| { readonly type: 'VALIDATION_FAILED'; readonly errors: SignupFormErrors }
	| { readonly type: 'SUBMIT_STARTED' }
	| { readonly type: 'SUBMIT_SUCCEEDED' }
	| { readonly type: 'SUBMIT_FAILED'; readonly error: string }

export type Credentials = {
	readonly email: string
	readonly password: string
}

export type SignupData = {
	readonly email: string
	readonly password: string
	readonly name: string
}

export type AuthSession = {
	readonly user: User
	readonly token: AuthToken
}
