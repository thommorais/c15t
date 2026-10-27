import { type LiveCollectionState, useLiveCollection } from '@thom/pb/realtime'
import type { Consent } from '../core/domain/consent'
import { useContainer } from './container'

const useConsents = (): LiveCollectionState<Consent> => {
	const { live } = useContainer()

	return useLiveCollection(live.consents.source, live.consents.options()).state
}

export { useConsents }
