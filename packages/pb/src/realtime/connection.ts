import type { Realtime } from '../client'

type Reconnects = {
	readonly onReconnect: (listener: () => void) => () => void
}

type Connection = Reconnects & {
	readonly onConnect: (listener: () => void) => () => void
}

const noop = () => {}

const createConnection = (realtime: Realtime): Connection => {
	const connects = new Set<() => void>()
	const reconnects = new Set<() => void>()
	let connected = false

	void realtime
		.subscribe('PB_CONNECT', () => {
			for (const listener of connects) listener()

			if (!connected) {
				connected = true
				return
			}

			for (const listener of reconnects) listener()
		})
		.catch(noop)

	const watch = (listeners: Set<() => void>) => (listener: () => void) => {
		listeners.add(listener)

		return () => {
			listeners.delete(listener)
		}
	}

	return { onConnect: watch(connects), onReconnect: watch(reconnects) }
}

export { createConnection }
export type { Connection, Reconnects }
