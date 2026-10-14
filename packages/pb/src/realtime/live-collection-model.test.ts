import { describe, expect, it } from 'vitest'
import { type Action, initial, type Model, reduce, Status, toView } from './live-collection-model'

type Row = { readonly id: string }

const ready = (items: readonly Row[]) => ({
	status: Status.Ready,
	items,
	totalItems: items.length,
	totalPages: 1,
})

const play = (actions: readonly Action<Row>[], from: Model<Row> = initial<Row>(false)): Model<Row> =>
	actions.reduce(reduce, from)

describe('an aborted read', () => {
	it('is ignored when a newer read has replaced it', () => {
		const older = Symbol('older')
		const newer = Symbol('newer')

		const before = play([
			{ type: 'requested', key: 'page-1', token: older },
			{ type: 'requested', key: 'page-2', token: newer },
		])

		expect(reduce(before, { type: 'aborted', token: older })).toBe(before)
	})

	it('is read again when nothing replaced it', () => {
		const token = Symbol('only')

		const before = play([{ type: 'requested', key: 'page-1', token }])
		const after = reduce(before, { type: 'aborted', token })

		expect(after.run).toBe(before.run + 1)
		expect(after.view).toEqual({ status: Status.Loading })
	})

	it('keeps the rows on screen while it is read again', () => {
		const first = Symbol('first')
		const refetch = Symbol('refetch')
		const view = ready([{ id: 'a' }])

		const before = play([
			{ type: 'requested', key: 'page-1', token: first },
			{ type: 'loaded', token: first, view },
			{ type: 'invalidated' },
			{ type: 'requested', key: 'page-1', token: refetch },
		])
		const after = reduce(before, { type: 'aborted', token: refetch })

		expect(after.run).toBe(before.run + 1)
		expect(after.view).toEqual(view)
	})

	it('settles normally once the repeated read arrives', () => {
		const aborted = Symbol('aborted')
		const repeated = Symbol('repeated')
		const view = ready([{ id: 'a' }])

		const after = play([
			{ type: 'requested', key: 'page-1', token: aborted },
			{ type: 'aborted', token: aborted },
			{ type: 'requested', key: 'page-1', token: repeated },
			{ type: 'loaded', token: repeated, view },
		])

		expect(after.view).toEqual(view)
		expect(reduce(after, { type: 'invalidated' }).run).toBe(after.run + 1)
	})
})

describe('a requested read', () => {
	it('keeps the same loading view when one is already showing', () => {
		const before = initial<Row>(false)
		const after = reduce(before, { type: 'requested', key: 'page-1', token: Symbol('first') })

		expect(after.view).toBe(before.view)
	})

	it('shows loading when the page being read changes', () => {
		const first = Symbol('first')

		const after = play([
			{ type: 'requested', key: 'page-1', token: first },
			{ type: 'loaded', token: first, view: ready([{ id: 'a' }]) },
			{ type: 'requested', key: 'page-2', token: Symbol('second') },
		])

		expect(after.view).toEqual({ status: Status.Loading })
	})
})

describe('a model', () => {
	it('starts loading', () => {
		expect(initial<Row>(false).view).toEqual({ status: Status.Loading })
	})

	it('starts idle when skipped', () => {
		expect(initial<Row>(true).view).toEqual({ status: Status.Idle })
	})

	it('goes idle when skipped later', () => {
		const token = Symbol('first')

		const after = play([
			{ type: 'requested', key: 'page-1', token },
			{ type: 'loaded', token, view: ready([{ id: 'a' }]) },
			{ type: 'skipped' },
		])

		expect(after.view).toEqual({ status: Status.Idle })
	})
})

describe('a loaded read', () => {
	it('shows its rows', () => {
		const token = Symbol('first')
		const view = ready([{ id: 'a' }])

		const after = play([
			{ type: 'requested', key: 'page-1', token },
			{ type: 'loaded', token, view },
		])

		expect(after.view).toBe(view)
	})

	it('is dropped when a newer read was requested since', () => {
		const older = Symbol('older')
		const newer = Symbol('newer')

		const before = play([
			{ type: 'requested', key: 'page-1', token: older },
			{ type: 'requested', key: 'page-2', token: newer },
		])

		expect(reduce(before, { type: 'loaded', token: older, view: ready([{ id: 'a' }]) })).toBe(before)
	})
})

describe('an invalidation', () => {
	const settled = () => {
		const token = Symbol('first')

		return play([
			{ type: 'requested', key: 'page-1', token },
			{ type: 'loaded', token, view: ready([{ id: 'a' }]) },
		])
	}

	it('asks for another read when none is running', () => {
		const before = settled()

		expect(reduce(before, { type: 'invalidated' }).run).toBe(before.run + 1)
	})

	it('waits for the running read instead of starting a second one', () => {
		const before = play([{ type: 'requested', key: 'page-1', token: Symbol('running') }])

		const after = play([{ type: 'invalidated' }, { type: 'invalidated' }, { type: 'invalidated' }], before)

		expect(after.run).toBe(before.run)
	})

	it('reads once more after the running read lands, however many arrived', () => {
		const token = Symbol('running')
		const before = play([{ type: 'requested', key: 'page-1', token }])

		const after = play(
			[{ type: 'invalidated' }, { type: 'invalidated' }, { type: 'loaded', token, view: ready([{ id: 'a' }]) }],
			before,
		)

		expect(after.run).toBe(before.run + 1)
		expect(after.view).toEqual(ready([{ id: 'a' }]))
	})

	it('is ignored while idle', () => {
		const before = initial<Row>(true)

		expect(reduce(before, { type: 'invalidated' })).toBe(before)
	})
})

describe('a changed record', () => {
	const showing = (items: readonly Row[]) => {
		const token = Symbol('first')

		return play([
			{ type: 'requested', key: 'page-1', token },
			{ type: 'loaded', token, view: ready(items) },
		])
	}

	const titled = (id: string, title: string) => ({ id, title }) as Row

	it('replaces the row it updates', () => {
		const before = showing([titled('a', 'old'), titled('b', 'other')])

		const after = reduce(before, { type: 'changed', action: 'update', entity: titled('a', 'new') })

		expect(after.view).toEqual(ready([titled('a', 'new'), titled('b', 'other')]))
	})

	it('removes the row it deletes', () => {
		const before = showing([{ id: 'a' }, { id: 'b' }])

		const after = reduce(before, { type: 'changed', action: 'delete', entity: { id: 'a' } })

		expect(after.view).toMatchObject({ items: [{ id: 'b' }] })
	})

	it('leaves the rows alone on a create, since only the server knows its page', () => {
		const before = showing([{ id: 'a' }])

		const after = reduce(before, { type: 'changed', action: 'create', entity: { id: 'z' } })

		expect(after.view).toEqual(before.view)
	})

	it('leaves the rows alone when it updates a row that is not on the page', () => {
		const before = showing([{ id: 'a' }])

		const after = reduce(before, { type: 'changed', action: 'update', entity: { id: 'z' } })

		expect(after.view).toEqual(before.view)
	})

	it.each(['create', 'update', 'delete'])('asks for another read on %s', action => {
		const before = showing([{ id: 'a' }])

		expect(reduce(before, { type: 'changed', action, entity: { id: 'a' } }).run).toBe(before.run + 1)
	})

	it('changes nothing visible before the first read lands', () => {
		const before = play([{ type: 'requested', key: 'page-1', token: Symbol('first') }])

		const after = reduce(before, { type: 'changed', action: 'update', entity: { id: 'a' } })

		expect(after.view).toBe(before.view)
	})
})

describe('toView', () => {
	it('maps every record of a successful read', () => {
		const view = toView(
			{ success: true, data: { page: 2, perPage: 10, totalItems: 12, totalPages: 2, items: [{ id: 'a', name: 'A' }] } },
			record => ({ id: record.id, label: record.name.toLowerCase() }),
		)

		expect(view).toEqual({ status: Status.Ready, items: [{ id: 'a', label: 'a' }], totalItems: 12, totalPages: 2 })
	})

	it('carries the message of a failed read', () => {
		const view = toView({ success: false, error: { message: 'Forbidden', code: 403 } }, record => record)

		expect(view).toEqual({ status: Status.Failed, message: 'Forbidden' })
	})
})
