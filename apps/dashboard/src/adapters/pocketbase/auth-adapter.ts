import { ClientResponseError } from 'pocketbase'
import type { Operator, Session } from '../../core/domain/session'
import { anonymous, authenticated } from '../../core/domain/session'
import type { AuthError, AuthPort, Credentials, SignInResult } from '../../core/ports/auth'
import { client } from './client'

const OPERATORS = 'operators'

type OperatorRecord = {
	readonly id: string
	readonly email?: string
	readonly tenantId?: string
}

const toOperator = (record: OperatorRecord): Operator => ({
	id: record.id,
	email: record.email ?? '',
	tenantId: record.tenantId ?? '',
})

const toAuthError = (cause: unknown): AuthError => {
	if (cause instanceof ClientResponseError) {
		if (cause.status === 0) return { kind: 'network' }
		if (cause.status === 400) return { kind: 'invalid-credentials' }
		return { kind: 'unknown', message: cause.message }
	}
	return { kind: 'unknown', message: cause instanceof Error ? cause.message : 'Sign in failed' }
}

const createAuthAdapter = (): AuthPort => {
	let key = ''
	let session: Session = anonymous

	const read = (): Session => {
		const record = client.authStore.record
		const valid = client.authStore.isValid && record?.collectionName === OPERATORS
		const next = valid ? `${record.id}:${client.authStore.token}` : ''

		if (next !== key) {
			key = next
			session = valid ? authenticated(toOperator(record as OperatorRecord)) : anonymous
		}

		return session
	}

	return {
		current: read,

		signIn: async ({ email, password }: Credentials): Promise<SignInResult> => {
			try {
				const result = await client.collection(OPERATORS).authWithPassword(email, password)
				return { ok: true, operator: toOperator(result.record as OperatorRecord) }
			} catch (cause) {
				return { ok: false, error: toAuthError(cause) }
			}
		},

		signOut: () => {
			client.authStore.clear()
		},

		subscribe: listener => client.authStore.onChange(() => listener(read())),
	}
}

export { createAuthAdapter, toAuthError }
