import type { Operator, Session } from '../domain/session'

type Credentials = {
	readonly email: string
	readonly password: string
}

type AuthError =
	| { readonly kind: 'invalid-credentials' }
	| { readonly kind: 'network' }
	| { readonly kind: 'unknown'; readonly message: string }

type SignInResult =
	| { readonly ok: true; readonly operator: Operator }
	| { readonly ok: false; readonly error: AuthError }

type AuthPort = {
	readonly current: () => Session
	readonly signIn: (credentials: Credentials) => Promise<SignInResult>
	readonly signOut: () => void
	readonly subscribe: (listener: (session: Session) => void) => () => void
}

export type { AuthError, AuthPort, Credentials, SignInResult }
