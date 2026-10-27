import type { LiveSource } from '@thom/pb/realtime'
import type { Consent } from '../../core/domain/consent'
import type { Live } from '../../core/ports/live'

const MAX_ROWS = 200

type ConsentRecord = {
	readonly id: string
	readonly subject: string
	readonly domain: string
	readonly purposes: readonly string[]
	readonly givenAt: string
	readonly validUntil: string
	readonly jurisdiction: string
	readonly consentAction: string
	readonly uiSource: string
	readonly expand?: { readonly domain?: { readonly id: string; readonly name: string } }
}

const toDate = (value: string): Date | undefined => (value ? new Date(value.replace(' ', 'T')) : undefined)

const toConsent = (record: ConsentRecord): Consent => ({
	id: record.id,
	subjectId: record.subject,
	domain: record.expand?.domain?.name ?? record.domain,
	action: record.consentAction,
	jurisdiction: record.jurisdiction,
	uiSource: record.uiSource,
	purposes: record.purposes.length,
	givenAt: toDate(record.givenAt),
	validUntil: toDate(record.validUntil),
})

// The collection rules scope every read to the operator's tenant, so the
// list needs no tenant filter of its own.
type Realtime = Pick<LiveSource<ConsentRecord, Consent>, 'client' | 'connection'>

const createConsentsLive = ({ client, connection }: Realtime): Live<ConsentRecord, Consent, void> => ({
	source: { client, collection: 'consent', map: toConsent, connection, expand: 'domain' },
	options: () => ({ sort: '-givenAt', perPage: MAX_ROWS }),
})

export { createConsentsLive, toConsent }
export type { ConsentRecord }
