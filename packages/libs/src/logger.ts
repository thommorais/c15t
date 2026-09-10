// oxlint-disable no-console

type LogLevel = 'error' | 'warn' | 'info' | 'log' | 'debug'
type LogMethod = (...args: unknown[]) => void

type Logger = {
	error: LogMethod
	warn: LogMethod
	info: LogMethod
	log: LogMethod
}

// Whether this is a production build has to read correctly from both places
// the package is consumed: Vite replaces import.meta.env in the app bundles,
// and leaves it undefined under plain Node (scripts, tests), where NODE_ENV is
// the convention. Reading only NODE_ENV, as the copy in @thom/ui does, means
// the check quietly fails open in the browser and every log ships to
// production.
type NodeGlobal = { readonly process?: { readonly env?: Record<string, string | undefined> } }

const isProduction = (): boolean => {
	const env = (import.meta as ImportMeta & { readonly env?: { readonly PROD?: boolean } }).env
	if (typeof env?.PROD === 'boolean') {
		return env.PROD
	}
	return (globalThis as NodeGlobal).process?.env?.NODE_ENV === 'production'
}

const createLogger = (): Logger => {
	const shouldLog = (level: LogLevel) => {
		if (isProduction()) {
			return level === 'error'
		}
		return true
	}

	const error: LogMethod = (...args) => {
		if (shouldLog('error')) {
			console.error(...args)
		}
	}

	const warn: LogMethod = (...args) => {
		if (shouldLog('warn')) {
			console.warn(...args)
		}
	}

	const info: LogMethod = (...args) => {
		if (shouldLog('info')) {
			console.info(...args)
		}
	}

	const log: LogMethod = (...args) => {
		if (shouldLog('log')) {
			console.log(...args)
		}
	}

	return {
		error,
		warn,
		info,
		log,
	}
}

export const logger = createLogger()
