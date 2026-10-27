import { describe, expect, it } from 'vitest'
import { type ConsentRecord, toConsent } from './consents-live'

const record = (overrides: Partial<ConsentRecord> = {}): ConsentRecord => ({
	id: 'c1',
	subject: 's1',
	domain: 'd1',
	purposes: ['p1', 'p2'],
	givenAt: '2026-10-14 12:30:00.000Z',
	validUntil: '',
	jurisdiction: 'GDPR',
	consentAction: 'all',
	uiSource: 'banner',
	...overrides,
})

describe('toConsent', () => {
	it('reads PocketBase dates, which separate date and time with a space', () => {
		const consent = toConsent(record({ validUntil: '2027-10-14 12:30:00.000Z' }))

		expect(consent.givenAt?.toISOString()).toBe('2026-10-14T12:30:00.000Z')
		expect(consent.validUntil?.toISOString()).toBe('2027-10-14T12:30:00.000Z')
	})

	it('leaves an empty date undefined', () => {
		expect(toConsent(record({ givenAt: '' })).givenAt).toBeUndefined()
		expect(toConsent(record()).validUntil).toBeUndefined()
	})

	it('names the domain when the relation expanded', () => {
		const consent = toConsent(record({ expand: { domain: { id: 'd1', name: 'shop.example' } } }))

		expect(consent.domain).toBe('shop.example')
	})

	it('falls back to the domain id when the relation did not expand', () => {
		expect(toConsent(record()).domain).toBe('d1')
	})

	it('counts the purposes and keeps the subject id', () => {
		const consent = toConsent(record())

		expect(consent.purposes).toBe(2)
		expect(consent.subjectId).toBe('s1')
		expect(consent.action).toBe('all')
	})
})
