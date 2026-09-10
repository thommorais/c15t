import { describe, expect, it } from 'vitest'
import { errorToResponse, tryCatch, tryCatchSync } from './try-catch'

describe('errorToResponse', () => {
	it('preserves an Error message rather than replacing it with status text', () => {
		const result = errorToResponse(new Error('database connection refused'))
		expect(result.error.message).toBe('database connection refused')
		expect(result.error.code).toBe(500)
	})

	it('reads a status code off the error', () => {
		expect(errorToResponse(Object.assign(new Error('nope'), { status: 404 })).error.code).toBe(404)
	})

	it('reads a status code off a response object', () => {
		expect(errorToResponse(Object.assign(new Error('nope'), { response: { status: 429 } })).error.code).toBe(429)
	})

	it('keeps the original error for inspection', () => {
		const original = new Error('boom')
		expect(errorToResponse(original).error.originalError).toBe(original)
	})

	it('does not mutate the error it is given', () => {
		const thrown = { message: '', code: undefined, originalError: undefined }
		const snapshot = { ...thrown }
		errorToResponse(thrown)
		expect(thrown).toEqual(snapshot)
	})

	it('fills in a message from the status code when one is missing', () => {
		expect(errorToResponse({ message: '', code: 404 }).error.message).toBe('Not Found')
	})

	it('describes a thrown primitive instead of hiding it', () => {
		const result = errorToResponse('something broke')
		expect(result.error.message).toBe('something broke')
		expect(result.error.originalError).toBe('something broke')
	})

	it('handles a thrown null', () => {
		expect(errorToResponse(null).error.message).toBe('null')
	})

	it('reports success false with the shared discriminant', () => {
		expect(errorToResponse(new Error('x')).success).toBe(false)
	})
})

describe('tryCatch', () => {
	it('wraps a resolved promise', async () => {
		expect(await tryCatch(Promise.resolve('ok'))).toEqual({ data: 'ok', success: true })
	})

	it('captures a rejection instead of throwing', async () => {
		const result = await tryCatch(Promise.reject(new Error('failed')))
		expect(result.success).toBe(false)
		if (!result.success) {
			expect(result.error.message).toBe('failed')
		}
	})

	it('narrows to the data when success is checked', async () => {
		const result = await tryCatch(Promise.resolve({ id: 1 }))
		if (result.success) {
			expect(result.data.id).toBe(1)
		} else {
			expect.unreachable('expected a success')
		}
	})
})

describe('tryCatchSync', () => {
	it('captures a synchronous throw', () => {
		const result = tryCatchSync(() => {
			throw new Error('sync boom')
		})
		expect(result.success).toBe(false)
		if (!result.success) {
			expect(result.error.message).toBe('sync boom')
		}
	})

	it('returns the value when nothing throws', () => {
		const result = tryCatchSync(() => 7)
		expect(result.success && result.data).toBe(7)
	})
})
