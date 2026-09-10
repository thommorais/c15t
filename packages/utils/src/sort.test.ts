import { describe, expect, it } from 'vitest'
import { alfaSort, numberSort } from './sort'

describe('alfaSort', () => {
	it('sorts case-insensitively', () => {
		expect(['banana', 'Apple', 'cherry'].sort(alfaSort)).toEqual(['Apple', 'banana', 'cherry'])
	})

	it('treats strings differing only by case as equal', () => {
		expect(alfaSort('abc', 'ABC')).toBe(0)
	})
})

describe('numberSort', () => {
	it('sorts numerically rather than lexicographically', () => {
		expect([10, 9, 100, 1].sort(numberSort)).toEqual([1, 9, 10, 100])
	})

	it('handles negatives', () => {
		expect([3, -1, 0].sort(numberSort)).toEqual([-1, 0, 3])
	})
})
