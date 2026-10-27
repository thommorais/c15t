import type { Overrides } from '../../options/overrides';
import type { ConsentExperiment } from '../experiment';
import type { ConsentJourneyOption } from '../journey';

export interface PrefetchOptions {
	backendURL: string;

	overrides?: Pick<Overrides, 'country' | 'region' | 'language' | 'gpc'>;

	credentials?: RequestCredentials;

	journey?: ConsentJourneyOption;

	experiment?: Pick<ConsentExperiment, 'arm' | 'arms' | 'id' | 'split'>;

	storageKey?: string;
}
