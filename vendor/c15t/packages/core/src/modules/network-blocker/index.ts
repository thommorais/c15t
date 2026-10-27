import { createNetworkBlockerWith } from './blocker';
import { networkBlockerTools } from './tools';
import type { NetworkBlockerHandle, NetworkBlockerOptions } from './types';

export type {
	BlockDecision,
	BlockedRequestInfo,
	NetworkBlockerConfig,
	NetworkBlockerHandle,
	NetworkBlockerOptions,
	NetworkBlockerRule,
} from './types';

export const createNetworkBlocker = function createNetworkBlocker(
	options: NetworkBlockerOptions
): NetworkBlockerHandle {
	return createNetworkBlockerWith(options, networkBlockerTools);
};
