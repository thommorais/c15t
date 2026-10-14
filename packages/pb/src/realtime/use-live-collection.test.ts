import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { filterFor } from '../filter-builder'
import { createFakeClient, type Row } from '../test/fake-client'
import { Status } from './live-collection-model'
import { type LiveCollectionOptions, type LiveSource, useLiveCollection } from './use-live-collection'

type Entity = { readonly id: string; readonly label: string }

type Fake = ReturnType<typeof createFakeClient>

const toEntity = (row: Row): Entity => ({ id: row.id, label: row.title.toUpperCase() })

const sourceOf = (fake: Fake): LiveSource<Row, Entity> => ({
	client: fake.client,
	collection: 'issues',
	map: toEntity,
	connection: fake.connection,
})

const tick = () => act(async () => {})

const answer = async (fake: Fake, rows: readonly Row[]) => {
	await tick()

	while (fake.pending().length > 0) {
		await act(async () => {
			for (const read of fake.pending()) read.resolve(rows)
		})
	}
}

const mount = (fake: Fake, options: LiveCollectionOptions = {}, extra: Partial<LiveSource<Row, Entity>> = {}) => {
	const renders = { count: 0 }
	const source = { ...sourceOf(fake), ...extra }

	const view = renderHook(
		(props: LiveCollectionOptions) => {
			renders.count += 1
			return useLiveCollection(source, props)
		},
		{ initialProps: options },
	)

	return { ...view, renders }
}

const statusColumns = filterFor<{ status: string }>()

describe('useLiveCollection', () => {
	describe('reading', () => {
		it('is loading until the first page arrives', async () => {
			const fake = createFakeClient()

			const { result } = mount(fake)
			await tick()

			expect(result.current.state).toEqual({ status: Status.Loading })
		})

		it('lists the mapped entries with the totals of the collection', async () => {
			const fake = createFakeClient()
			const { result } = mount(fake)
			await tick()

			await act(async () =>
				fake.pending()[0]?.resolve([{ id: 'a', title: 'first' }], { totalItems: 41, totalPages: 3 }),
			)

			expect(result.current.state).toEqual({
				status: Status.Ready,
				items: [{ id: 'a', label: 'FIRST' }],
				totalItems: 41,
				totalPages: 3,
			})
		})

		it('asks for the first page with the default page size', async () => {
			const fake = createFakeClient()

			const { result } = mount(fake)
			await tick()

			expect(fake.reads[0]).toMatchObject({ page: 1, perPage: 30 })
			expect(result.current).toMatchObject({ page: 1, perPage: 30 })
		})

		it('sends the filter, the sort and the page size', async () => {
			const fake = createFakeClient()
			const filter = statusColumns([{ field: 'status', comparator: 'eq', value: 'open' }])

			mount(fake, { filter, sort: '-created', perPage: 5 })
			await tick()

			expect(fake.reads[0]).toMatchObject({
				perPage: 5,
				options: { filter: 'status = {:p0} {"p0":"open"}', sort: '-created' },
			})
		})

		it('sends the expand of the source on the read and on the subscription', async () => {
			const fake = createFakeClient()

			mount(fake, {}, { expand: 'client,members.user' })
			await tick()

			expect(fake.reads[0]?.options).toMatchObject({ expand: 'client,members.user' })
			expect(fake.subscriptions[0]?.options).toMatchObject({ expand: 'client,members.user' })
		})

		it('sends no expand when the source has none', async () => {
			const fake = createFakeClient()

			mount(fake)
			await tick()

			expect(fake.reads[0]?.options).not.toHaveProperty('expand')
		})

		it('sends neither filter nor sort when there is none', async () => {
			const fake = createFakeClient()
			const filter = statusColumns([{ field: 'status', comparator: 'eq', value: undefined }])

			mount(fake, { filter })
			await tick()

			expect(fake.reads[0]?.options).not.toHaveProperty('filter')
			expect(fake.reads[0]?.options).not.toHaveProperty('sort')
		})

		it('reports a read that failed', async () => {
			const fake = createFakeClient()
			const { result } = mount(fake)
			await tick()

			await act(async () => {
				for (const read of fake.pending()) read.fail(new Error('Forbidden'))
			})

			expect(result.current.state).toEqual({ status: Status.Failed, message: 'Forbidden' })
		})

		it('does not read again on a render that changes nothing', async () => {
			const fake = createFakeClient()
			const filter = () => statusColumns([{ field: 'status', comparator: 'eq', value: 'open' }])
			const { rerender } = mount(fake, { filter: filter() })
			await answer(fake, [])
			const reads = fake.reads.length

			rerender({ filter: filter() })
			await tick()

			expect(fake.reads).toHaveLength(reads)
			expect(fake.open()).toHaveLength(1)
		})
	})

	describe('skipping', () => {
		it('stays idle without reading or subscribing', async () => {
			const fake = createFakeClient()

			const { result } = mount(fake, { skip: true })
			await tick()

			expect(result.current.state).toEqual({ status: Status.Idle })
			expect(fake.reads).toHaveLength(0)
			expect(fake.subscriptions).toHaveLength(0)
		})

		it('starts reading once it is no longer skipped', async () => {
			const fake = createFakeClient()
			const { result, rerender } = mount(fake, { skip: true })
			await tick()

			rerender({ skip: false })
			await answer(fake, [{ id: 'a', title: 'first' }])

			expect(result.current.state).toMatchObject({ status: Status.Ready, items: [{ id: 'a' }] })
			expect(fake.open()).toHaveLength(1)
		})

		it('goes idle and closes the subscription when skipped later', async () => {
			const fake = createFakeClient()
			const { result, rerender } = mount(fake)
			await answer(fake, [{ id: 'a', title: 'first' }])

			rerender({ skip: true })
			await tick()

			expect(result.current.state).toEqual({ status: Status.Idle })
			expect(fake.open()).toHaveLength(0)
		})
	})

	describe('realtime', () => {
		it('subscribes to every record of the collection, under the same filter as the read', async () => {
			const fake = createFakeClient()
			const filter = statusColumns([{ field: 'status', comparator: 'eq', value: 'open' }])

			mount(fake, { filter })
			await tick()

			expect(fake.subscriptions).toHaveLength(1)
			expect(fake.subscriptions[0]).toMatchObject({ topic: '*', options: { filter: fake.reads[0]?.options?.filter } })
		})

		it('reads again once the subscription is live, to cover the gap before it', async () => {
			const fake = createFakeClient()
			const { result } = mount(fake)
			await tick()

			await act(async () => fake.pending()[0]?.resolve([{ id: 'a', title: 'stale' }]))
			expect(fake.pending()).toHaveLength(1)

			await act(async () => fake.pending()[0]?.resolve([{ id: 'a', title: 'fresh' }]))

			expect(result.current.state).toMatchObject({ items: [{ id: 'a', label: 'FRESH' }] })
			expect(fake.pending()).toHaveLength(0)
		})

		it('shows an update at once, then the page the server sends back', async () => {
			const fake = createFakeClient()
			const { result } = mount(fake)
			await answer(fake, [
				{ id: 'a', title: 'one' },
				{ id: 'b', title: 'two' },
			])

			act(() => fake.emit('update', { id: 'a', title: 'changed' }))

			expect(result.current.state).toMatchObject({
				items: [
					{ id: 'a', label: 'CHANGED' },
					{ id: 'b', label: 'TWO' },
				],
			})

			await answer(fake, [
				{ id: 'b', title: 'two' },
				{ id: 'a', title: 'changed' },
			])

			expect(result.current.state).toMatchObject({ items: [{ id: 'b' }, { id: 'a' }] })
		})

		it('removes a deleted row at once, then refills the page from the server', async () => {
			const fake = createFakeClient()
			const { result } = mount(fake)
			await answer(fake, [
				{ id: 'a', title: 'one' },
				{ id: 'b', title: 'two' },
			])

			act(() => fake.emit('delete', { id: 'a', title: 'one' }))

			expect(result.current.state).toMatchObject({ items: [{ id: 'b' }] })

			await answer(fake, [
				{ id: 'b', title: 'two' },
				{ id: 'c', title: 'three' },
			])

			expect(result.current.state).toMatchObject({ items: [{ id: 'b' }, { id: 'c' }] })
		})

		it('waits for the server to place a created row', async () => {
			const fake = createFakeClient()
			const { result } = mount(fake)
			await answer(fake, [{ id: 'b', title: 'two' }])

			act(() => fake.emit('create', { id: 'a', title: 'one' }))

			expect(result.current.state).toMatchObject({ items: [{ id: 'b' }] })
			expect(fake.pending()).toHaveLength(1)

			await answer(fake, [
				{ id: 'a', title: 'one' },
				{ id: 'b', title: 'two' },
			])

			expect(result.current.state).toMatchObject({ items: [{ id: 'a' }, { id: 'b' }] })
		})

		it('answers a burst of events with one read in flight and one after it', async () => {
			const fake = createFakeClient()
			mount(fake)
			await answer(fake, [{ id: 'a', title: 'one' }])
			const before = fake.reads.length

			act(() => {
				fake.emit('update', { id: 'a', title: 'two' })
				fake.emit('update', { id: 'a', title: 'three' })
				fake.emit('update', { id: 'a', title: 'four' })
			})

			expect(fake.pending()).toHaveLength(1)

			await answer(fake, [{ id: 'a', title: 'four' }])

			expect(fake.reads).toHaveLength(before + 2)
		})

		it('reads again after a reconnect', async () => {
			const fake = createFakeClient()
			const { result } = mount(fake)
			await answer(fake, [{ id: 'a', title: 'one' }])

			act(() => fake.reconnect())
			await answer(fake, [{ id: 'a', title: 'missed' }])

			expect(result.current.state).toMatchObject({ items: [{ id: 'a', label: 'MISSED' }] })
		})

		it('closes the subscription on unmount', async () => {
			const fake = createFakeClient()
			const { unmount } = mount(fake)
			await answer(fake, [])

			unmount()
			await tick()

			expect(fake.open()).toHaveLength(0)
		})
	})

	describe('paging', () => {
		it('reads the page it is moved to', async () => {
			const fake = createFakeClient()
			const { result } = mount(fake)
			await answer(fake, [{ id: 'a', title: 'one' }])

			act(() => result.current.setPage(2))

			expect(result.current.page).toBe(2)
			expect(result.current.state).toEqual({ status: Status.Loading })
			expect(fake.pending()[0]).toMatchObject({ page: 2 })

			await answer(fake, [{ id: 'z', title: 'last' }])

			expect(result.current.state).toMatchObject({ items: [{ id: 'z' }] })
		})

		it('keeps one subscription across pages', async () => {
			const fake = createFakeClient()
			const { result } = mount(fake)
			await answer(fake, [])

			act(() => result.current.setPage(2))
			await answer(fake, [])

			expect(fake.subscriptions).toHaveLength(1)
		})

		it('returns to the first page when the filter changes', async () => {
			const fake = createFakeClient()
			const filterBy = (status: string) => statusColumns([{ field: 'status', comparator: 'eq', value: status }])
			const { result, rerender } = mount(fake, { filter: filterBy('open') })
			await answer(fake, [])
			act(() => result.current.setPage(3))
			await answer(fake, [])

			rerender({ filter: filterBy('closed') })
			await tick()

			expect(result.current.page).toBe(1)
			expect(fake.pending()[0]).toMatchObject({ page: 1, options: { filter: 'status = {:p0} {"p0":"closed"}' } })
		})

		it('moves the subscription to the new filter', async () => {
			const fake = createFakeClient()
			const filterBy = (status: string) => statusColumns([{ field: 'status', comparator: 'eq', value: status }])
			const { rerender } = mount(fake, { filter: filterBy('open') })
			await answer(fake, [])

			rerender({ filter: filterBy('closed') })
			await answer(fake, [])

			expect(fake.open()).toHaveLength(1)
			expect(fake.open()[0]?.options).toEqual({ filter: 'status = {:p0} {"p0":"closed"}' })
		})

		it.each([
			['sort', { sort: 'title' }],
			['page size', { perPage: 10 }],
		])('returns to the first page when the %s changes', async (_name, next) => {
			const fake = createFakeClient()
			const { result, rerender } = mount(fake)
			await answer(fake, [])
			act(() => result.current.setPage(2))
			await answer(fake, [])

			rerender(next)
			await tick()

			expect(result.current.page).toBe(1)
		})
	})

	describe('cancelled reads', () => {
		it('reads under one request key per hook, different from any other hook', async () => {
			const fake = createFakeClient()
			const first = mount(fake)
			mount(fake)
			await answer(fake, [])
			act(() => first.result.current.setPage(2))
			await tick()

			const keys = new Set(fake.reads.map(read => read.options?.requestKey))

			expect(keys.size).toBe(2)
			expect([...keys].every(key => typeof key === 'string' && key.length > 0)).toBe(true)
		})

		it('ignores a read cancelled by the one that replaced it', async () => {
			const fake = createFakeClient()
			const { result } = mount(fake)
			await answer(fake, [{ id: 'a', title: 'one' }])
			act(() => result.current.setPage(2))
			await tick()
			const replaced = fake.pending()[0]
			act(() => result.current.setPage(3))
			await tick()
			const reads = fake.reads.length

			await act(async () => replaced?.abort())

			expect(result.current.state).toEqual({ status: Status.Loading })
			expect(fake.reads).toHaveLength(reads)

			await answer(fake, [{ id: 'c', title: 'third' }])

			expect(result.current.state).toMatchObject({ items: [{ id: 'c' }] })
		})

		it('reads again when a read is cancelled with nothing replacing it', async () => {
			const fake = createFakeClient()
			const { result } = mount(fake)
			await answer(fake, [{ id: 'a', title: 'one' }])
			act(() => result.current.setPage(2))
			await tick()
			const reads = fake.reads.length

			await act(async () => fake.pending()[0]?.abort())

			expect(result.current.state).toEqual({ status: Status.Loading })
			expect(fake.reads).toHaveLength(reads + 1)
			expect(fake.pending()[0]).toMatchObject({ page: 2 })

			await answer(fake, [{ id: 'b', title: 'two' }])

			expect(result.current.state).toMatchObject({ items: [{ id: 'b' }] })
		})

		it('keeps the rows on screen while a cancelled refresh is repeated', async () => {
			const fake = createFakeClient()
			const { result } = mount(fake)
			await answer(fake, [{ id: 'a', title: 'one' }])
			act(() => fake.reconnect())
			await tick()

			await act(async () => fake.pending()[0]?.abort())

			expect(result.current.state).toMatchObject({ status: Status.Ready, items: [{ id: 'a' }] })
			expect(fake.pending()).toHaveLength(1)
		})
	})

	describe('rendering', () => {
		it('does not re-render a component that never reads the entries', async () => {
			const fake = createFakeClient()
			const source = sourceOf(fake)
			const renders = { count: 0 }

			renderHook(() => {
				renders.count += 1
				return useLiveCollection(source).page
			})
			await answer(fake, [{ id: 'a', title: 'one' }])
			act(() => fake.emit('update', { id: 'a', title: 'two' }))
			await answer(fake, [{ id: 'a', title: 'two' }])

			expect(renders.count).toBe(1)
		})

		it('renders a reader of the entries once per change it can see', async () => {
			const fake = createFakeClient()
			const source = sourceOf(fake)
			const renders = { count: 0 }

			renderHook(() => {
				renders.count += 1
				return useLiveCollection(source).state
			})
			await tick()
			const mounted = renders.count

			await act(async () => fake.pending()[0]?.resolve([{ id: 'a', title: 'one' }]))

			expect(mounted).toBe(1)
			expect(renders.count).toBe(2)
		})

		it('keeps two hooks over one collection apart', async () => {
			const fake = createFakeClient()
			const first = mount(fake)
			const second = mount(fake)
			await answer(fake, [{ id: 'a', title: 'one' }])

			act(() => first.result.current.setPage(2))
			await tick()

			expect(first.result.current.state).toEqual({ status: Status.Loading })
			expect(second.result.current.state).toMatchObject({ status: Status.Ready })
			expect(second.result.current.page).toBe(1)
		})
	})
})
