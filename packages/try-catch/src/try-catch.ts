import { err, ok, type Safe, type SafeError } from '@thom/safe-return'

/** Standard API error shape. */
export interface ErrorResponse {
	code?: number
	message: string
	stack?: string
	originalError?: unknown
}

const DEFAULT_STATUS = 500

/** Standard HTTP status code messages. */
const HTTP_STATUS_MESSAGES: Record<number, string> = {
	400: 'Bad Request',
	401: 'Unauthorized',
	403: 'Forbidden',
	404: 'Not Found',
	405: 'Method Not Allowed',
	408: 'Request Timeout',
	409: 'Conflict',
	429: 'Too Many Requests',
	500: 'Internal Server Error',
	502: 'Bad Gateway',
	503: 'Service Unavailable',
	504: 'Gateway Timeout',
}

type StatusCarrier = {
	status?: unknown
	response?: { status?: unknown }
}

/** Reads an HTTP status off an error, as thrown by fetch wrappers and axios. */
const readStatusCode = (error: unknown): number | undefined => {
	if (typeof error !== 'object' || error === null) {
		return undefined
	}

	const { status, response } = error as StatusCarrier
	const candidate = typeof status === 'number' ? status : response?.status

	return typeof candidate === 'number' ? candidate : undefined
}

const isErrorResponse = (value: object): value is ErrorResponse =>
	'message' in value || 'code' in value || 'originalError' in value

/**
 * Normalises any thrown value into a `SafeError<ErrorResponse>`.
 *
 * Never mutates the value it is given; the returned error is always a fresh
 * object.
 */
export function errorToResponse(error: unknown): SafeError<ErrorResponse> {
	if (error instanceof Error) {
		const code = readStatusCode(error) ?? DEFAULT_STATUS

		// A thrown Error carries the most specific message available, so it wins
		// over the generic status text.
		return err({
			code,
			message: error.message || HTTP_STATUS_MESSAGES[code] || 'Unknown Error',
			originalError: error,
			stack: error.stack,
		})
	}

	if (typeof error === 'object' && error !== null && isErrorResponse(error)) {
		const code = error.code ?? readStatusCode(error.originalError) ?? DEFAULT_STATUS

		return err({
			...error,
			code,
			message: error.message || HTTP_STATUS_MESSAGES[code] || 'Unknown Error',
			originalError: error.originalError ?? error,
			stack: error.stack ?? new Error().stack,
		})
	}

	// A primitive was thrown (`throw 'boom'`), so the only description we have is
	// the value itself.
	return err({
		code: DEFAULT_STATUS,
		message: String(error),
		originalError: error,
		stack: new Error().stack,
	})
}

/**
 * Wraps a promise so failures become structured `ErrorResponse` values.
 *
 * @example
 * const result = await tryCatch(fetchUserData(userId))
 * if (!result.success) {
 *   logger.error(result.error.code, result.error.message)
 *   return
 * }
 * logger.info('User:', result.data)
 */
export async function tryCatch<T>(promise: Promise<T>): Promise<Safe<T, ErrorResponse>> {
	try {
		return ok(await promise)
	} catch (error) {
		return errorToResponse(error)
	}
}

/** Runs a synchronous function, capturing throws as structured errors. */
export function tryCatchSync<T>(fn: () => T): Safe<T, ErrorResponse> {
	try {
		return ok(fn())
	} catch (error) {
		return errorToResponse(error)
	}
}
