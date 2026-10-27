import type { ConsentSnapshot } from '../types';

export const IAB_UNAVAILABLE_ERROR_CODE = 'C15T_IAB_UNAVAILABLE';

export class IABUnavailableError extends Error {
	readonly code = IAB_UNAVAILABLE_ERROR_CODE;

	constructor(problem: string, fix: string) {
		super(
			`c15t: this visitor's policy uses IAB TCF, but ${problem}. ${fix}, or remove the IAB model from your policy.`
		);
		this.name = 'IABUnavailableError';
	}
}

export const policyNeedsIAB = function policyNeedsIAB(
	snapshot: Pick<
		ConsentSnapshot,
		'externalPermissions' | 'iab' | 'policyRule' | 'resolution'
	>
): boolean {
	const { iab } = snapshot;
	return (
		snapshot.resolution.status === 'matched' &&
		snapshot.policyRule.model === 'iab' &&
		snapshot.externalPermissions === undefined &&
		iab !== null &&
		(iab.enabled || iab.gvl !== null || Boolean(iab.gvlReference))
	);
};
