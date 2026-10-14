import type { Safe } from '@thom/safe-return'
import type { ErrorResponse } from '@thom/try-catch'
import type { ListResult } from '../client'

type Entity = Record<'id', unknown>

const Status = {
	Idle: 'idle',
	Loading: 'loading',
	Ready: 'ready',
	Failed: 'failed',
} as const

type LiveCollectionState<TEntity> =
	| { readonly status: typeof Status.Idle }
	| { readonly status: typeof Status.Loading }
	| {
			readonly status: typeof Status.Ready
			readonly items: readonly TEntity[]
			readonly totalItems: number
			readonly totalPages: number
	  }
	| { readonly status: typeof Status.Failed; readonly message: string }

const Pending = {
	None: 'none',
	Running: 'running',
	Stale: 'stale',
} as const

type Pending = (typeof Pending)[keyof typeof Pending]

type Model<TEntity> = {
	readonly view: LiveCollectionState<TEntity>
	readonly key: string | undefined
	readonly token: symbol | undefined
	readonly pending: Pending
	readonly run: number
}

type Action<TEntity> =
	| { readonly type: 'skipped' }
	| { readonly type: 'requested'; readonly key: string; readonly token: symbol }
	| { readonly type: 'loaded'; readonly token: symbol; readonly view: LiveCollectionState<TEntity> }
	| { readonly type: 'aborted'; readonly token: symbol }
	| { readonly type: 'invalidated' }
	| { readonly type: 'changed'; readonly action: string; readonly entity: TEntity }

type ListOutcome<TRecord> = Safe<ListResult<TRecord>, ErrorResponse>

const initial = <TEntity>(skip: boolean): Model<TEntity> => ({
	view: { status: skip ? Status.Idle : Status.Loading },
	key: undefined,
	token: undefined,
	pending: Pending.None,
	run: 0,
})

const toView = <TRecord, TEntity>(
	result: ListOutcome<TRecord>,
	map: (record: TRecord) => TEntity,
): LiveCollectionState<TEntity> =>
	result.success
		? {
				status: Status.Ready,
				items: result.data.items.map(record => map(record)),
				totalItems: result.data.totalItems,
				totalPages: result.data.totalPages,
			}
		: { status: Status.Failed, message: result.error.message }

const patchItems = <TEntity extends Entity>(
	items: readonly TEntity[],
	action: string,
	entity: TEntity,
): readonly TEntity[] => {
	if (action === 'create') return items
	if (action === 'delete') return items.filter(item => item.id !== entity.id)

	return items.map(item => (item.id === entity.id ? entity : item))
}

const patch = <TEntity extends Entity>(model: Model<TEntity>, action: string, entity: TEntity): Model<TEntity> =>
	model.view.status === Status.Ready
		? { ...model, view: { ...model.view, items: patchItems(model.view.items, action, entity) } }
		: model

const rerun = <TEntity>(model: Model<TEntity>): Model<TEntity> => ({
	...model,
	pending: Pending.Running,
	run: model.run + 1,
})

const invalidate = <TEntity>(model: Model<TEntity>): Model<TEntity> => {
	if (model.view.status === Status.Idle) return model
	if (model.pending === Pending.None) return rerun(model)

	return { ...model, pending: Pending.Stale }
}

const settle = <TEntity>(model: Model<TEntity>, view: LiveCollectionState<TEntity>): Model<TEntity> =>
	model.pending === Pending.Stale ? rerun({ ...model, view }) : { ...model, view, pending: Pending.None }

const keepsView = <TEntity>(model: Model<TEntity>, key: string): boolean =>
	key === model.key || model.view.status === Status.Loading

const reduce = <TEntity extends Entity>(model: Model<TEntity>, action: Action<TEntity>): Model<TEntity> => {
	switch (action.type) {
		case 'skipped':
			return { ...initial<TEntity>(true), run: model.run }
		case 'requested':
			return {
				...model,
				view: keepsView(model, action.key) ? model.view : { status: Status.Loading },
				key: action.key,
				token: action.token,
				pending: Pending.Running,
			}
		case 'loaded':
			return action.token === model.token ? settle(model, action.view) : model
		case 'aborted':
			return action.token === model.token ? rerun(model) : model
		case 'invalidated':
			return invalidate(model)
		case 'changed':
			return invalidate(patch(model, action.action, action.entity))
	}
}

export { Status, initial, reduce, toView }
export type { Action, Entity, ListOutcome, LiveCollectionState, Model }
