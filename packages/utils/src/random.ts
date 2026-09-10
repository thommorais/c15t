/** Returns a shuffled copy, leaving the input array untouched. */
const shuffle = <T>(array: T[]): T[] => {
	const result = [...array]

	for (let i = result.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1))
		const a = result[i] as T
		const b = result[j] as T
		result[i] = b
		result[j] = a
	}

	return result
}

/** Picks `numItems` distinct positions from the array. Duplicate values are preserved. */
const randomItems = <T>(array: T[], numItems: number): T[] => {
	const count = Math.min(Math.max(numItems, 0), array.length)
	return shuffle(array).slice(0, count)
}

const randomFromInterval = (min: number, max: number) => Math.floor(Math.random() * (max - min) + min)

/**
 * Returns `quantity` distinct integers from the half-open interval [min, max).
 * Bounds are floored, so the pool is only ever whole numbers.
 *
 * @throws when `quantity` exceeds the number of integers the interval holds
 */
const randsFromInterval = (min: number, max: number, quantity: number): number[] => {
	const lower = Math.floor(min)
	const upper = Math.floor(max)

	if (quantity > upper - lower) {
		throw new Error('Quantity must be less or equal to the interval size')
	}

	const numbers = new Set<number>()

	while (numbers.size < quantity) {
		numbers.add(randomFromInterval(lower, upper))
	}

	return Array.from(numbers)
}

/** Returns up to `qnt` distinct indexes valid for an array of length `range`. */
const getRandomIndexes = (range: number, qnt: number) => {
	const size = Math.floor(range)
	return randsFromInterval(0, size, Math.min(qnt, size))
}

export { getRandomIndexes, randomFromInterval, randomItems, randsFromInterval, shuffle }
