import { describe, expect, it } from 'vitest'
import { getRandomIndexes, randomFromInterval, randomItems, randsFromInterval, shuffle } from './random'

describe('shuffle', () => {
	it('leaves the input array untouched', () => {
		const input = [1, 2, 3, 4, 5]
		shuffle(input)
		expect(input).toEqual([1, 2, 3, 4, 5])
	})

	it('preserves every element', () => {
		expect(shuffle([1, 2, 3, 4, 5]).sort()).toEqual([1, 2, 3, 4, 5])
	})

	it('handles empty and single-element arrays', () => {
		expect(shuffle([])).toEqual([])
		expect(shuffle([1])).toEqual([1])
	})

	// A biased shuffle (the classic `i` vs `i + 1` off-by-one) still passes every
	// test above, so assert the distribution is actually uniform.
	it('distributes elements uniformly across positions', () => {
		const size = 5
		const runs = 30_000
		const counts = Array.from({ length: size }, () => Array(size).fill(0) as number[])

		for (let run = 0; run < runs; run++) {
			for (const [index, value] of shuffle([0, 1, 2, 3, 4]).entries()) {
				counts[value]![index]!++
			}
		}

		const expected = runs / size
		for (const row of counts) {
			for (const count of row) {
				expect(Math.abs(count - expected) / expected).toBeLessThan(0.1)
			}
		}
	})
})

describe('randomItems', () => {
	// The original implementation collected into a Set, so duplicate values
	// collapsed and the loop spun forever.
	it('preserves duplicate values instead of hanging', () => {
		expect(randomItems(['a', 'a', 'a'], 3)).toEqual(['a', 'a', 'a'])
	})

	it('caps the count at the array length', () => {
		expect(randomItems([1, 2], 99).sort()).toEqual([1, 2])
	})

	it('returns an empty array for non-positive counts', () => {
		expect(randomItems([1, 2, 3], 0)).toEqual([])
		expect(randomItems([1, 2, 3], -5)).toEqual([])
	})

	it('returns only elements drawn from the source', () => {
		const source = [1, 2, 3, 4, 5]
		for (const item of randomItems(source, 3)) {
			expect(source).toContain(item)
		}
	})
})

describe('randomFromInterval', () => {
	it('stays within the half-open interval', () => {
		for (let i = 0; i < 500; i++) {
			const value = randomFromInterval(3, 7)
			expect(value).toBeGreaterThanOrEqual(3)
			expect(value).toBeLessThan(7)
		}
	})
})

describe('randsFromInterval', () => {
	it('returns the requested quantity of distinct integers', () => {
		const result = randsFromInterval(0, 10, 5)
		expect(result).toHaveLength(5)
		expect(new Set(result).size).toBe(5)
	})

	it('fills the interval exactly when quantity equals its size', () => {
		expect(randsFromInterval(0, 5, 5).sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4])
	})

	// The original compared `quantity > max`, ignoring `min`, so this hung.
	it('accounts for min when validating quantity', () => {
		expect(() => randsFromInterval(5, 10, 8)).toThrow(/less or equal/)
	})

	it('floors fractional bounds', () => {
		for (const value of randsFromInterval(0, 3.9, 3)) {
			expect(Number.isInteger(value)).toBe(true)
			expect(value).toBeLessThan(3)
		}
	})
})

describe('getRandomIndexes', () => {
	it('returns indexes valid for the given length', () => {
		const result = getRandomIndexes(5, 3)
		expect(result).toHaveLength(3)
		for (const index of result) {
			expect(index).toBeGreaterThanOrEqual(0)
			expect(index).toBeLessThan(5)
		}
	})

	// A fractional range used to slip past the guard and yield out-of-range indexes.
	it('never returns an index past the end of a fractional range', () => {
		for (const index of getRandomIndexes(3.5, 4)) {
			expect(index).toBeLessThan(3)
		}
	})

	it('returns an empty array for an empty range', () => {
		expect(getRandomIndexes(0, 3)).toEqual([])
	})
})
