import { describe, expect, it, vi } from 'vitest'
import { err, errorToSafe, flatMap, map, ok, safe, safeAsync, safeSync, unwrapOr, type Safe } from './safe-return'

describe('errorToSafe', () => {
	it('prefers the explicit message when given', () => {
		expect(errorToSafe(new Error('inner'), 'outer')).toEqual({ success: false, error: 'outer' })
	})

	it('uses an Error message', () => {
		expect(errorToSafe(new Error('boom'))).toEqual({ success: false, error: 'boom' })
	})

	// An Error with an empty message used to produce `error: ''`, a falsy error
	// string that reads as "no error" at a glance.
	it('never yields an empty error string', () => {
		expect(errorToSafe(new Error(''))).toEqual({ success: false, error: "error can't be identified" })
	})

	it('reports a thrown string instead of discarding it', () => {
		expect(errorToSafe('rate limited')).toEqual({ success: false, error: 'rate limited' })
	})

	it('falls back for values it cannot describe', () => {
		expect(errorToSafe(null)).toEqual({ success: false, error: "error can't be identified" })
		expect(errorToSafe({ weird: true })).toEqual({ success: false, error: "error can't be identified" })
	})

	it('treats an empty explicit message as intentional', () => {
		expect(errorToSafe(new Error('boom'), '')).toEqual({ success: false, error: '' })
	})
})

describe('safeSync', () => {
	it('wraps a returned value', () => {
		expect(safeSync(() => 42)).toEqual({ data: 42, success: true })
	})

	it('captures a throw', () => {
		expect(
			safeSync(() => {
				throw new Error('nope')
			}),
		).toEqual({ success: false, error: 'nope' })
	})

	it('preserves falsy data rather than treating it as failure', () => {
		expect(safeSync(() => 0)).toEqual({ data: 0, success: true })
		expect(safeSync(() => null)).toEqual({ data: null, success: true })
	})
})

describe('safeAsync', () => {
	it('wraps a resolved promise', async () => {
		expect(await safeAsync(Promise.resolve('ok'))).toEqual({ data: 'ok', success: true })
	})

	it('captures a rejection', async () => {
		expect(await safeAsync(Promise.reject(new Error('failed')))).toEqual({ success: false, error: 'failed' })
	})
})

describe('safe', () => {
	it('runs a synchronous function', () => {
		const result = safe(() => JSON.parse('{"a":1}') as { a: number })
		expect(result).toEqual({ data: { a: 1 }, success: true })
	})

	it('captures a synchronous throw', () => {
		const result = safe(() => JSON.parse('not json'))
		expect(result.success).toBe(false)
	})

	it('awaits a promise passed directly', async () => {
		expect(await safe(Promise.resolve(1))).toEqual({ data: 1, success: true })
	})

	// The original called safeSync for any non-Promise argument, so a function
	// returning a promise reported success immediately with the pending promise
	// as `data`, and its rejection escaped unhandled.
	it('awaits a promise returned by a function', async () => {
		const result = await safe(async () => 'resolved')
		expect(result).toEqual({ data: 'resolved', success: true })
	})

	it('captures a rejection from a promise-returning function', async () => {
		const onUnhandled = vi.fn()
		process.on('unhandledRejection', onUnhandled)

		try {
			const result = await safe(async () => {
				throw new Error('async boom')
			})
			expect(result).toEqual({ success: false, error: 'async boom' })
			await new Promise(resolve => setImmediate(resolve))
			expect(onUnhandled).not.toHaveBeenCalled()
		} finally {
			process.off('unhandledRejection', onUnhandled)
		}
	})

	it('applies the fallback message to an async rejection', async () => {
		expect(await safe(Promise.reject(new Error('inner')), 'outer')).toEqual({ success: false, error: 'outer' })
	})

	it('narrows to data when success is checked', () => {
		const result: Safe<number> = safe(() => 5)
		if (result.success) {
			expect(result.data).toBe(5)
		} else {
			expect.unreachable('expected a success')
		}
	})
})

describe('ok / err', () => {
	it('builds a success', () => {
		expect(ok(1)).toEqual({ data: 1, success: true })
	})

	it('builds a failure', () => {
		expect(err('bad')).toEqual({ error: 'bad', success: false })
	})

	it('carries a structured error when given one', () => {
		expect(err({ code: 404 }).error).toEqual({ code: 404 })
	})
})

describe('map', () => {
	it('transforms the data of a success', () => {
		const result = map(ok(2), n => n * 3)
		expect(result.success && result.data).toBe(6)
	})

	it('passes a failure through untouched', () => {
		const failed = err('keep me')
		expect(map(failed, (n: number) => n * 2)).toBe(failed)
	})
})

describe('flatMap', () => {
	it('chains a result-returning function', () => {
		const result = flatMap(ok(2), (n: number) => ok(n + 1))
		expect(result.success && result.data).toBe(3)
	})

	it('propagates a failure from the chained function', () => {
		const result = flatMap<number, number, string>(ok(2), () => err('inner'))
		expect(!result.success && result.error).toBe('inner')
	})

	it('passes an existing failure through untouched', () => {
		const failed = err('keep me')
		expect(flatMap(failed, (n: number) => ok(n))).toBe(failed)
	})
})

describe('unwrapOr', () => {
	it('returns the data of a success', () => {
		expect(unwrapOr(ok(5), 0)).toBe(5)
	})

	it('returns the fallback for a failure', () => {
		expect(unwrapOr(err('nope'), 0)).toBe(0)
	})

	it('returns falsy data rather than the fallback', () => {
		expect(unwrapOr(ok(0), 99)).toBe(0)
	})
})
