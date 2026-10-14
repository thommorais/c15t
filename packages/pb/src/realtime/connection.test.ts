import { describe, expect, it, vi } from 'vitest'
import { createConnection } from './connection'

const fakeRealtime = () => {
	const handlers: (() => void)[] = []

	return {
		subscribe: vi.fn(async (_topic: string, handler: () => void) => {
			handlers.push(handler)
		}),
		connect: () => {
			for (const handler of handlers) handler()
		},
	}
}

describe('a connection', () => {
	it('tells onConnect listeners about every connect, the first included', () => {
		const realtime = fakeRealtime()
		const listener = vi.fn()
		createConnection(realtime).onConnect(listener)

		realtime.connect()
		realtime.connect()

		expect(listener).toHaveBeenCalledTimes(2)
	})

	it('tells onConnect listeners before reconnect listeners', () => {
		const realtime = fakeRealtime()
		const order: string[] = []
		const connection = createConnection(realtime)
		connection.onReconnect(() => order.push('reconnect'))
		connection.onConnect(() => order.push('connect'))

		realtime.connect()
		realtime.connect()

		expect(order).toEqual(['connect', 'connect', 'reconnect'])
	})

	it('stops telling an onConnect listener once it is removed', () => {
		const realtime = fakeRealtime()
		const listener = vi.fn()
		createConnection(realtime).onConnect(listener)()

		realtime.connect()

		expect(listener).not.toHaveBeenCalled()
	})

	it('listens for the connect event', () => {
		const realtime = fakeRealtime()

		createConnection(realtime)

		expect(realtime.subscribe).toHaveBeenCalledExactlyOnceWith('PB_CONNECT', expect.any(Function))
	})

	it('stays quiet on the first connect', () => {
		const realtime = fakeRealtime()
		const listener = vi.fn()
		createConnection(realtime).onReconnect(listener)

		realtime.connect()

		expect(listener).not.toHaveBeenCalled()
	})

	it('tells listeners about every connect after the first', () => {
		const realtime = fakeRealtime()
		const listener = vi.fn()
		createConnection(realtime).onReconnect(listener)

		realtime.connect()
		realtime.connect()
		realtime.connect()

		expect(listener).toHaveBeenCalledTimes(2)
	})

	it('stops telling a listener that was removed', () => {
		const realtime = fakeRealtime()
		const listener = vi.fn()
		const remove = createConnection(realtime).onReconnect(listener)

		realtime.connect()
		remove()
		realtime.connect()

		expect(listener).not.toHaveBeenCalled()
	})

	it('handles a realtime service that refuses the subscription', () => {
		const refusal = Promise.reject<void>(new Error('offline'))
		const handled = vi.spyOn(refusal, 'catch')

		createConnection({ subscribe: () => refusal })

		expect(handled).toHaveBeenCalledOnce()
	})
})
