import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cIC, rIC } from './idle-callback'

beforeEach(() => {
	vi.useFakeTimers()
})

afterEach(() => {
	vi.useRealTimers()
	vi.unstubAllGlobals()
})

describe('rIC', () => {
	it('delegates to the native API when present', () => {
		const native = vi.fn().mockReturnValue(7)
		vi.stubGlobal('requestIdleCallback', native)
		vi.stubGlobal('cancelIdleCallback', vi.fn())

		const callback = vi.fn()
		expect(rIC(callback)).toBe(7)
		expect(native).toHaveBeenCalled()
	})

	it('falls back to a timeout when the API is missing', async () => {
		vi.stubGlobal('requestIdleCallback', undefined)
		vi.stubGlobal('cancelIdleCallback', undefined)

		const callback = vi.fn()
		rIC(callback)
		expect(callback).not.toHaveBeenCalled()

		await vi.advanceTimersByTimeAsync(1)
		expect(callback).toHaveBeenCalledTimes(1)
	})

	it('gives the shimmed callback a deadline with a shrinking budget', async () => {
		vi.stubGlobal('requestIdleCallback', undefined)
		vi.stubGlobal('cancelIdleCallback', undefined)

		let remaining = -1
		rIC(deadline => {
			remaining = deadline.timeRemaining()
		})

		await vi.advanceTimersByTimeAsync(1)
		expect(remaining).toBeGreaterThanOrEqual(0)
		expect(remaining).toBeLessThanOrEqual(50)
	})

	it('reports didTimeout false on the shim', async () => {
		vi.stubGlobal('requestIdleCallback', undefined)
		vi.stubGlobal('cancelIdleCallback', undefined)

		let didTimeout: boolean | null = null
		rIC(deadline => {
			didTimeout = deadline.didTimeout
		})

		await vi.advanceTimersByTimeAsync(1)
		expect(didTimeout).toBe(false)
	})
})

describe('cIC', () => {
	it('delegates to the native API when present', () => {
		const nativeCancel = vi.fn()
		vi.stubGlobal('requestIdleCallback', vi.fn())
		vi.stubGlobal('cancelIdleCallback', nativeCancel)

		cIC(3)
		expect(nativeCancel).toHaveBeenCalledWith(3)
	})

	it('cancels a shimmed callback before it fires', async () => {
		vi.stubGlobal('requestIdleCallback', undefined)
		vi.stubGlobal('cancelIdleCallback', undefined)

		const callback = vi.fn()
		cIC(rIC(callback))

		await vi.advanceTimersByTimeAsync(10)
		expect(callback).not.toHaveBeenCalled()
	})

	// A partial polyfill (rIC without cIC) used to be treated as full support,
	// so cancelling would call a function that does not exist.
	it('treats partial native support as unsupported', () => {
		vi.stubGlobal('requestIdleCallback', vi.fn())
		vi.stubGlobal('cancelIdleCallback', undefined)

		expect(() => cIC(1)).not.toThrow()
	})
})
