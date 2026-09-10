import { describe, expect, it } from 'vitest'
import { slugify, upperCaseFirstLetter } from './string'

describe('upperCaseFirstLetter', () => {
	it('capitalises the first character', () => {
		expect(upperCaseFirstLetter('hello')).toBe('Hello')
	})

	it('leaves the rest of the string alone', () => {
		expect(upperCaseFirstLetter('hello WORLD')).toBe('Hello WORLD')
	})

	it('handles the empty string', () => {
		expect(upperCaseFirstLetter('')).toBe('')
	})
})

describe('slugify', () => {
	it('lowercases and joins words with dashes', () => {
		expect(slugify('Hello World')).toBe('hello-world')
	})

	it('folds Latin accents', () => {
		expect(slugify('São Paulo')).toBe('sao-paulo')
		expect(slugify('Café Com Leite')).toBe('cafe-com-leite')
	})

	it('drops punctuation', () => {
		expect(slugify('hello world!')).toBe('hello-world')
	})

	it('collapses repeated dashes', () => {
		expect(slugify('a  --  b')).toBe('a-b')
	})

	it('trims leading and trailing dashes', () => {
		expect(slugify('  -hi-  ')).toBe('hi')
	})

	// Documented limitation: no ASCII decomposition exists for these scripts.
	it('yields an empty string for input with no Latin characters', () => {
		expect(slugify('Привет мир')).toBe('')
	})
})
