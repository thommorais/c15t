import { ClientResponseError } from 'pocketbase'
import { describe, expect, it } from 'vitest'
import { toAuthError } from './auth-adapter'

const responseError = (status: number) => new ClientResponseError({ status, response: { message: 'nope' } })

describe('toAuthError', () => {
	it('maps a 400 to wrong credentials', () => {
		expect(toAuthError(responseError(400))).toEqual({ kind: 'invalid-credentials' })
	})

	it('maps status 0 to a network failure', () => {
		expect(toAuthError(responseError(0))).toEqual({ kind: 'network' })
	})

	it('keeps the message of any other response', () => {
		expect(toAuthError(responseError(500))).toEqual({ kind: 'unknown', message: 'nope' })
	})

	it('keeps the message of a thrown error', () => {
		expect(toAuthError(new Error('boom'))).toEqual({ kind: 'unknown', message: 'boom' })
	})
})
