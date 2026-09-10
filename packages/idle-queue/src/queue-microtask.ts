export type Microtask = () => void

type Scheduler = (microtask: Microtask) => void

/** Rethrows asynchronously so a failing task cannot swallow the error. */
const rethrowAsync = (error: unknown) => {
	setTimeout(() => {
		throw error
	}, 0)
}

const viaNativeQueueMicrotask = (): Scheduler => microtask => {
	globalThis.queueMicrotask(() => {
		try {
			microtask()
		} catch (error) {
			rethrowAsync(error)
		}
	})
}

const viaPromise = (): Scheduler => microtask => {
	void Promise.resolve().then(() => {
		try {
			microtask()
		} catch (error) {
			rethrowAsync(error)
		}
	})
}

/** Last resort for engines predating both native scheduling paths. */
const viaMutationObserver = (): Scheduler => {
	let counter = 0
	let pending: Microtask[] = []

	const node = document.createTextNode('')

	const observer = new MutationObserver(() => {
		// Swap the queue out first, so tasks queued during this flush land in the
		// next one instead of being dropped.
		const tasks = pending
		pending = []

		for (const microtask of tasks) {
			try {
				microtask()
			} catch (error) {
				rethrowAsync(error)
			}
		}
	})

	observer.observe(node, { characterData: true })

	return microtask => {
		pending.push(microtask)
		node.data = String(++counter % 2)
	}
}

const selectScheduler = (): Scheduler => {
	if (typeof globalThis.queueMicrotask === 'function') {
		return viaNativeQueueMicrotask()
	}

	if (typeof Promise === 'function') {
		return viaPromise()
	}

	return viaMutationObserver()
}

// Resolved on first use rather than at import, so the module stays safe to
// import where no DOM exists.
let scheduler: Scheduler | null = null

/**
 * Schedules a callback on the microtask queue, rethrowing failures instead of
 * turning them into unhandled rejections.
 */
export const queueMicrotask = (microtask: Microtask): void => {
	scheduler ??= selectScheduler()
	scheduler(microtask)
}
