type Cleanable = Record<string, unknown>

/**
 * Returns a shallow copy without `null` or `undefined` props. Values that are
 * merely falsy (`0`, `false`, `''`) are kept.
 */
const clearNullish = <T extends Cleanable>(obj: T): Partial<T> => {
	const clone = { ...obj }

	for (const key of Object.keys(clone) as (keyof T)[]) {
		if (clone[key] === null || clone[key] === undefined) {
			delete clone[key]
		}
	}

	return clone
}

/**
 * Returns a shallow copy without falsy props (`null`, `undefined`, `0`,
 * `false`, `''`, `NaN`) and without empty arrays.
 */
const clearFalsy = <T extends Cleanable>(obj: T): Partial<T> => {
	const clone = { ...obj }

	for (const key of Object.keys(clone) as (keyof T)[]) {
		const value = clone[key]

		if (!value || (Array.isArray(value) && value.length === 0)) {
			delete clone[key]
		}
	}

	return clone
}

export { clearFalsy, clearNullish }
