import { describe, expect, it } from 'vitest'
import { clearFalsy, clearNullish } from './object'

describe('clearNullish', () => {
	it('strips only null and undefined', () => {
		expect(clearNullish({ a: 0, b: false, c: '', d: 'x', e: null, f: undefined })).toEqual({
			a: 0,
			b: false,
			c: '',
			d: 'x',
		})
	})

	it('keeps empty arrays', () => {
		expect(clearNullish({ list: [] })).toEqual({ list: [] })
	})

	it('does not mutate the input', () => {
		const input = { a: null, b: 1 }
		clearNullish(input)
		expect(input).toEqual({ a: null, b: 1 })
	})
})

describe('clearFalsy', () => {
	it('strips every falsy value and empty arrays', () => {
		expect(clearFalsy({ a: 0, b: false, c: '', d: 'x', e: [], f: [1], g: null, h: undefined })).toEqual({
			d: 'x',
			f: [1],
		})
	})

	it('does not mutate the input', () => {
		const input = { a: 0, b: 1 }
		clearFalsy(input)
		expect(input).toEqual({ a: 0, b: 1 })
	})
})
