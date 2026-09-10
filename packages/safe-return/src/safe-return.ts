/** A successful result, carrying data. */
export interface SafeData<T> {
	success: true
	data: T
}

/** A failed result, carrying an error. */
export interface SafeError<E = string> {
	success: false
	error: E
}

/**
 * Either a value or an error, never both.
 *
 * @typeParam T the type of the successful value
 * @typeParam E the type of the error; a plain message by default
 */
export type Safe<T, E = string> = SafeData<T> | SafeError<E>

const UNIDENTIFIED_ERROR = "error can't be identified"

/** Creates a successful result. */
export function ok<T>(data: T): SafeData<T> {
	return { data, success: true }
}

/** Creates a failed result. */
export function err<E = string>(error: E): SafeError<E> {
	return { error, success: false }
}

/**
 * Converts a thrown value into a `SafeError` carrying a message.
 *
 * @param e the thrown value
 * @param message an optional message that overrides whatever `e` describes
 */
export function errorToSafe(e: unknown, message?: string): SafeError<string> {
	if (message !== undefined) {
		return err(message)
	}

	if (e instanceof Error) {
		return err(e.message || UNIDENTIFIED_ERROR)
	}

	if (typeof e === 'string' && e !== '') {
		return err(e)
	}

	return err(UNIDENTIFIED_ERROR)
}

/**
 * Runs a synchronous function, capturing anything it throws.
 *
 * @param func the function to run
 * @param message an optional message to report instead of the thrown one
 */
export function safeSync<T>(func: () => T, message?: string): Safe<T> {
	try {
		return ok(func())
	} catch (e) {
		return errorToSafe(e, message)
	}
}

/**
 * Awaits a promise, capturing a rejection.
 *
 * @param promise the promise to await
 * @param message an optional message to report instead of the rejected one
 */
export async function safeAsync<T>(promise: Promise<T>, message?: string): Promise<Safe<T>> {
	try {
		return ok(await promise)
	} catch (e) {
		return errorToSafe(e, message)
	}
}

/**
 * Runs a function or awaits a promise, capturing failures as values.
 *
 * A function that returns a promise resolves to `Promise<Safe<T>>`, so a
 * rejection is captured rather than escaping as an unhandled rejection.
 *
 * @example
 * const result = safe(() => JSON.parse(raw))
 * if (!result.success) return
 * use(result.data)
 */
export function safe<T>(promise: Promise<T>, message?: string): Promise<Safe<T>>
export function safe<T>(func: () => Promise<T>, message?: string): Promise<Safe<T>>
export function safe<T>(func: () => T, message?: string): Safe<T>
export function safe<T>(
	promiseOrFunc: Promise<T> | (() => T | Promise<T>),
	message?: string,
): Promise<Safe<T>> | Safe<T> {
	if (promiseOrFunc instanceof Promise) {
		return safeAsync(promiseOrFunc, message)
	}

	// A function returning a promise must be awaited too, otherwise the
	// rejection escapes as an unhandled rejection and `success: true` is
	// reported for work that has not finished.
	const result = safeSync(promiseOrFunc, message)

	if (result.success && result.data instanceof Promise) {
		return safeAsync(result.data as Promise<T>, message)
	}

	return result as Safe<T>
}

/** Transforms the data of a successful result, passing failures through. */
export function map<T, U, E>(result: Safe<T, E>, fn: (value: T) => U): Safe<U, E> {
	return result.success ? ok(fn(result.data)) : result
}

/** Chains a result-returning function, passing failures through. */
export function flatMap<T, U, E>(result: Safe<T, E>, fn: (value: T) => Safe<U, E>): Safe<U, E> {
	return result.success ? fn(result.data) : result
}

/** Returns the data of a success, or `fallback` for a failure. */
export function unwrapOr<T, E>(result: Safe<T, E>, fallback: T): T {
	return result.success ? result.data : fallback
}
