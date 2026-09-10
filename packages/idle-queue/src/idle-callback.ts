/** Mirrors the DOM `IdleDeadline`, so the shim and the native object agree. */
export interface IdleDeadline {
	didTimeout: boolean
	timeRemaining: () => number
}

export type IdleRequestCallback = (deadline: IdleDeadline) => void

export interface IdleRequestOptions {
	timeout?: number
}

/** The budget the shim reports, matching the spec's frame allowance. */
const SHIM_BUDGET_MS = 50

const supportsRequestIdleCallback = () =>
	typeof globalThis.requestIdleCallback === 'function' && typeof globalThis.cancelIdleCallback === 'function'

const createIdleDeadline = (initTime: number): IdleDeadline => ({
	didTimeout: false,
	timeRemaining: () => Math.max(0, SHIM_BUDGET_MS - (Date.now() - initTime)),
})

const requestIdleCallbackShim = (callback: IdleRequestCallback): number => {
	const deadline = createIdleDeadline(Date.now())
	return setTimeout(() => callback(deadline), 0) as unknown as number
}

const cancelIdleCallbackShim = (handle: number): void => {
	clearTimeout(handle)
}

/**
 * Requests an idle callback, falling back to a timeout where the API is
 * missing. Support is checked per call so the module stays importable under
 * SSR, where no global exists at load time.
 */
export const rIC = (callback: IdleRequestCallback, options?: IdleRequestOptions): number =>
	supportsRequestIdleCallback()
		? globalThis.requestIdleCallback(callback as globalThis.IdleRequestCallback, options)
		: requestIdleCallbackShim(callback)

/** Cancels a callback scheduled by {@link rIC}. */
export const cIC = (handle: number): void => {
	if (supportsRequestIdleCallback()) {
		globalThis.cancelIdleCallback(handle)
	} else {
		cancelIdleCallbackShim(handle)
	}
}
