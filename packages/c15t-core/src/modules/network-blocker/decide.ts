import type { ConsentSnapshot } from '../../types';
import type { evaluateConsent } from '../has';
import type { BlockDecision, NetworkBlockerRule } from './types';
import { hostnameMatchesRule, methodMatchesRule, pathMatchesRule } from './url';

export const evaluateBlock = function evaluateBlock(
	url: URL,
	method: string,
	rules: NetworkBlockerRule[],
	snapshot: ConsentSnapshot,
	evaluate: typeof evaluateConsent
): BlockDecision {
	for (const rule of rules) {
		if (!hostnameMatchesRule(url.hostname, rule)) {
			continue;
		}
		if (!pathMatchesRule(url.pathname, rule)) {
			continue;
		}
		if (!methodMatchesRule(method, rule)) {
			continue;
		}

		const allowed = evaluate(rule, snapshot);
		if (!allowed) {
			return { rule, shouldBlock: true };
		}
	}
	return { shouldBlock: false };
};
