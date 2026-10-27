import type { LiveCollectionOptions, LiveSource } from '@thom/pb/realtime'

type Live<TRecord, TEntity extends Record<'id', unknown>, TQuery> = {
	readonly source: LiveSource<TRecord, TEntity>
	readonly options: (query: TQuery) => LiveCollectionOptions
}

export type { Live }
