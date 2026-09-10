import { afterEach, describe, expect, it, vi } from 'vitest'
import { isBrowser, isMobile, isServerSide, updateBodyCustomProp } from './env'

afterEach(() => {
	vi.unstubAllGlobals()
})

describe('isServerSide', () => {
	it('is true when window is absent', () => {
		expect(isServerSide()).toBe(true)
	})

	it('is false once window exists', () => {
		vi.stubGlobal('window', {})
		expect(isServerSide()).toBe(false)
	})
})

describe('isBrowser', () => {
	it('is false without a DOM', () => {
		expect(isBrowser()).toBe(false)
	})

	// Evaluated per call, so stubbing the DOM after import is reflected. As a
	// module-load-time constant this could not work.
	it('picks up a DOM stubbed after import', () => {
		vi.stubGlobal('window', {})
		vi.stubGlobal('document', {})
		expect(isBrowser()).toBe(true)
	})
})

describe('isMobile', () => {
	it('returns false on the server rather than touching navigator', () => {
		expect(isMobile()).toBe(false)
	})

	it('detects a mobile user agent', () => {
		vi.stubGlobal('window', {})
		vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' })
		expect(isMobile()).toBe(true)
	})

	it('rejects a desktop user agent', () => {
		vi.stubGlobal('window', {})
		vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' })
		expect(isMobile()).toBe(false)
	})
})

describe('updateBodyCustomProp', () => {
	it('sets the property inside an animation frame', () => {
		const setProperty = vi.fn()
		vi.stubGlobal('document', { body: { style: { setProperty } } })
		vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
			cb(0)
			return 0
		})

		updateBodyCustomProp('--x', '1px')
		expect(setProperty).toHaveBeenCalledWith('--x', '1px')
	})
})
