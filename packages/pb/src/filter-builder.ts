type Comparator = 'eq' | 'neq' | 'anyOf' | 'contains' | 'containsAll' | 'gte' | 'lte'

type FilterValue = string | number | boolean | Date

type Filterable = Record<string, FilterValue | readonly FilterValue[] | undefined>

type Clause<T extends Filterable> = {
	[K in keyof T]-?: {
		readonly field: K
		readonly comparator: Comparator
		readonly value: T[K] | readonly NonNullable<T[K]>[] | undefined
	}
}[keyof T]

type Operator = {
	eq: '='
	neq: '!='
	contains: '~'
	gte: '>='
	lte: '<='
	anyOf: '='
	containsAll: '~'
}

type Joiner = {
	anyOf: '||'
	containsAll: '&&'
}

type Part<F extends string, C extends Comparator> = C extends keyof Joiner
	? `(${F} ${Operator[C]} {:pN} ${Joiner[C]} ...)`
	: `${F} ${Operator[C]} {:pN}`

type Expr<C> = C extends readonly [infer Head, ...infer Tail]
	? Head extends { field: infer F extends string; comparator: infer Cmp extends Comparator }
		? Tail extends readonly []
			? Part<F, Cmp>
			: `${Part<F, Cmp>} && ${Expr<Tail>}`
		: never
	: ''

type Bound<V> = V extends Date ? string : V extends readonly (infer I)[] ? Bound<I> : V

type BoundValues<C> = C extends readonly [infer Head, ...infer Tail]
	? Head extends { value: infer V }
		? Bound<NonNullable<V>> | BoundValues<Tail>
		: never
	: never

type Filter<C extends readonly unknown[] = readonly unknown[]> = {
	readonly expr: Expr<C>
	readonly params: Readonly<Record<`p${number}`, BoundValues<C>>>
}

type AnyFilter = {
	readonly expr: string
	readonly params: Readonly<Record<string, unknown>>
}

const operators = {
	eq: '=',
	neq: '!=',
	contains: '~',
	gte: '>=',
	lte: '<=',
	anyOf: '=',
	containsAll: '~',
} as const satisfies Operator

const joiners = {
	anyOf: '||',
	containsAll: '&&',
} as const satisfies Joiner

const isEmpty = (value: unknown): boolean =>
	value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)

const scalar = (value: unknown): Scalar => (value instanceof Date ? value.toISOString() : (value as Scalar))

const filterFor =
	<T extends Filterable>() =>
	<const C extends readonly Clause<T>[]>(clauses: C): Filter<C> =>
		build(clauses)

type Scalar = string | number | boolean

type AnyClause = { readonly field: unknown; readonly comparator: Comparator; readonly value: unknown }

type Bindings = {
	readonly parts: readonly string[]
	readonly params: Readonly<Record<string, Scalar>>
}

const isJoined = (comparator: Comparator): comparator is keyof Joiner => comparator in joiners

const valuesOf = ({ comparator, value }: AnyClause): readonly unknown[] =>
	isJoined(comparator) && Array.isArray(value) ? value : [value]

const bind = ({ parts, params }: Bindings, clause: AnyClause): Bindings => {
	const { field, comparator } = clause
	const offset = Object.keys(params).length
	const bound = valuesOf(clause).map((value, at) => [`p${offset + at}`, scalar(value)] as const)
	const terms = bound.map(([key]) => `${String(field)} ${operators[comparator]} {:${key}}`)
	const part = isJoined(comparator) ? `(${terms.join(` ${joiners[comparator]} `)})` : terms.join('')

	return { parts: [...parts, part], params: { ...params, ...Object.fromEntries(bound) } }
}

const build = <const C extends readonly AnyClause[]>(clauses: C): Filter<C> => {
	const { parts, params } = clauses
		.filter(({ value }) => !isEmpty(value))
		.reduce<Bindings>(bind, { parts: [], params: {} })

	return {
		expr: parts.join(' && ') as Expr<C>,
		params: params as Filter<C>['params'],
	}
}

export { filterFor }
export type { AnyFilter, Clause, Comparator, Filter, FilterValue, Filterable }
