type Unsubscribe = () => Promise<void>

type RequestOptions = Record<string, unknown>

type ListResult<TRecord> = {
	readonly page: number
	readonly perPage: number
	readonly totalItems: number
	readonly totalPages: number
	readonly items: readonly TRecord[]
}

type RecordEvent<TRecord> = {
	readonly action: string
	readonly record: TRecord
}

type CollectionService<TRecord> = {
	readonly getList: (page: number, perPage: number, options?: RequestOptions) => Promise<ListResult<TRecord>>
	readonly subscribe: (
		topic: string,
		handler: (event: RecordEvent<TRecord>) => void,
		options?: RequestOptions,
	) => Promise<Unsubscribe>
}

type Client<TRecord> = {
	readonly filter: (expr: string, params?: Record<string, unknown>) => string
	readonly collection: (name: string) => CollectionService<TRecord>
}

type Realtime = {
	readonly subscribe: (topic: string, handler: () => void) => Promise<unknown>
}

export type { Client, CollectionService, ListResult, Realtime, RecordEvent, RequestOptions, Unsubscribe }
