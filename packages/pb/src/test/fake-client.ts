import type { Client, ListResult, RecordEvent, RequestOptions } from '../client'
import type { Reconnects } from '../realtime/connection'

type Row = { readonly id: string; readonly title: string }

type Read = {
	readonly page: number
	readonly perPage: number
	readonly options: RequestOptions | undefined
	readonly resolve: (rows: readonly Row[], totals?: Partial<ListResult<Row>>) => void
	readonly fail: (error: Error) => void
	readonly abort: () => void
	settled: boolean
}

type Subscription = {
	readonly topic: string
	readonly options: RequestOptions | undefined
	readonly emit: (action: string, record: Row) => void
	closed: boolean
}

const createFakeClient = () => {
	const reads: Read[] = []
	const subscriptions: Subscription[] = []
	const reconnectListeners = new Set<() => void>()

	const client: Client<Row> = {
		filter: (expr, params) => `${expr} ${JSON.stringify(params ?? {})}`,
		collection: () => ({
			getList: (page, perPage, options) =>
				new Promise<ListResult<Row>>((resolve, reject) => {
					const read: Read = {
						page,
						perPage,
						options,
						settled: false,
						resolve: (rows, totals) => {
							read.settled = true
							resolve({ page, perPage, totalItems: rows.length, totalPages: 1, items: rows, ...totals })
						},
						fail: error => {
							read.settled = true
							reject(error)
						},
						abort: () => read.fail(Object.assign(new Error('The request was aborted'), { isAbort: true })),
					}

					reads.push(read)
				}),
			subscribe: async (topic, handler, options) => {
				const subscription: Subscription = {
					topic,
					options,
					closed: false,
					emit: (action, record) => {
						if (!subscription.closed) handler({ action, record } satisfies RecordEvent<Row>)
					},
				}

				subscriptions.push(subscription)

				return async () => {
					subscription.closed = true
				}
			},
		}),
	}

	const connection: Reconnects = {
		onReconnect: listener => {
			reconnectListeners.add(listener)

			return () => {
				reconnectListeners.delete(listener)
			}
		},
	}

	return {
		client,
		connection,
		reads,
		subscriptions,
		pending: () => reads.filter(read => !read.settled),
		open: () => subscriptions.filter(subscription => !subscription.closed),
		emit: (action: string, record: Row) => {
			for (const subscription of subscriptions) subscription.emit(action, record)
		},
		reconnect: () => {
			for (const listener of reconnectListeners) listener()
		},
	}
}

export { createFakeClient }
export type { Row }
