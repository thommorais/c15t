import type { ConsentState } from '../types';

export const normalizeExternalPermissions = (
	permissions: Partial<ConsentState>
): Readonly<ConsentState> =>
	Object.freeze({
		experience: permissions.experience === true,
		functionality: permissions.functionality === true,
		marketing: permissions.marketing === true,
		measurement: permissions.measurement === true,
		necessary: true,
	});

export const evaluateExternalPermissions = (
	permissions: Readonly<ConsentState>
) => ({
	nextDeadline: null,
	permissions,
	promptRequirement: { kind: 'none' as const },
	restrictions: {},
});
