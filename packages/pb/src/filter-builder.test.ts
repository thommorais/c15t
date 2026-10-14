import { describe, expect, it } from 'vitest'
import { filterFor } from './filter-builder'

type Columns = {
	'project.slug': string
	title: string
	details: string
	status: 'pending' | 'in_progress' | 'done'
	priority: 'low' | 'medium' | 'high'
	role: string
	tags: string
	position: number
	created: Date
}

const filter = filterFor<Columns>()

describe('filterFor', () => {
	it('binds values rather than interpolating them', () => {
		const { expr, params } = filter([{ field: 'project.slug', comparator: 'eq', value: 'folio' }])

		expect(expr).toBe('project.slug = {:p0}')
		expect(params).toEqual({ p0: 'folio' })
	})

	it('skips empty values so callers need no pre-checks', () => {
		const { expr, params } = filter([
			{ field: 'title', comparator: 'contains', value: undefined },
			{ field: 'status', comparator: 'anyOf', value: [] },
			{ field: 'details', comparator: 'eq', value: '' },
			{ field: 'priority', comparator: 'eq', value: 'high' },
		])

		expect(expr).toBe('priority = {:p0}')
		expect(params).toEqual({ p0: 'high' })
	})

	it('joins multiple clauses with AND', () => {
		const { expr } = filter([
			{ field: 'project.slug', comparator: 'eq', value: 'folio' },
			{ field: 'priority', comparator: 'eq', value: 'low' },
		])

		expect(expr).toBe('project.slug = {:p0} && priority = {:p1}')
	})

	it('expands anyOf to OR within a group', () => {
		const { expr, params } = filter([{ field: 'status', comparator: 'anyOf', value: ['pending', 'done'] }])

		const preview: '(status = {:pN} || ...)' = expr
		expect(preview).toBe('(status = {:p0} || status = {:p1})')
		expect(params).toEqual({ p0: 'pending', p1: 'done' })
	})

	it('expands containsAll to AND, which a JSON array column needs', () => {
		const { expr, params } = filter([{ field: 'tags', comparator: 'containsAll', value: ['search', 'perf'] }])

		expect(expr).toBe('(tags ~ {:p0} && tags ~ {:p1})')
		expect(params).toEqual({ p0: 'search', p1: 'perf' })
	})

	it('parenthesises an expansion even when it holds one item, so the type matches', () => {
		const { expr } = filter([{ field: 'status', comparator: 'anyOf', value: ['done'] }])

		const preview: '(status = {:pN} || ...)' = expr
		expect(preview).toBe('(status = {:p0})')
	})

	it('serialises dates to ISO strings', () => {
		const { params } = filter([{ field: 'created', comparator: 'gte', value: new Date('2026-09-11T00:00:00.000Z') }])

		expect(params).toEqual({ p0: '2026-09-11T00:00:00.000Z' })
	})

	it('keeps a quote inside the bound value, never in the expression', () => {
		const { expr, params } = filter([{ field: 'title', comparator: 'contains', value: 'it\'s "quoted"' }])

		expect(expr).toBe('title ~ {:p0}')
		expect(params).toEqual({ p0: 'it\'s "quoted"' })
	})

	it('returns an empty expression when every clause is skipped', () => {
		const { expr, params } = filter([{ field: 'title', comparator: 'eq', value: undefined }])

		expect(expr).toBe('')
		expect(params).toEqual({})
	})

	it('supports neq and lte', () => {
		const { expr } = filter([
			{ field: 'role', comparator: 'neq', value: 'viewer' },
			{ field: 'position', comparator: 'lte', value: 5 },
		])

		expect(expr).toBe('role != {:p0} && position <= {:p1}')
	})

	it('types expr as the literal expression it will produce', () => {
		const { expr } = filter([
			{ field: 'project.slug', comparator: 'eq', value: 'folio' },
			{ field: 'title', comparator: 'contains', value: 'x' },
		])

		const preview: 'project.slug = {:pN} && title ~ {:pN}' = expr
		expect(preview).toBe('project.slug = {:p0} && title ~ {:p1}')
	})
})
