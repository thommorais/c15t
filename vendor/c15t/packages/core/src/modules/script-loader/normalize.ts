import type { AllConsentNames } from '../../consent/consent-types';
import type { NormalizedScript, Script, ScriptLoaderTools } from './types';

const anonymizedElementIds = new Map<string, string>();

export const generateRandomId = function generateRandomId(): string {
	if (
		typeof crypto !== 'undefined' &&
		typeof crypto.randomUUID === 'function'
	) {
		return crypto.randomUUID().replace(/-/gu, '').slice(0, 8);
	}
	return Math.random().toString(36).slice(2, 10);
};

export const normalizeScripts = function normalizeScripts(
	scripts: Script[],
	isVendorId: ScriptLoaderTools['isVendorId']
): NormalizedScript[] {
	return scripts.map((script) => ({
		hasIabMeta: Boolean(
			script.vendorId !== undefined ||
			(script.iabPurposes && script.iabPurposes.length > 0) ||
			(script.iabLegIntPurposes && script.iabLegIntPurposes.length > 0) ||
			(script.iabSpecialFeatures && script.iabSpecialFeatures.length > 0)
		),
		script,
		simpleCategory:
			typeof script.category === 'string'
				? (script.category as AllConsentNames)
				: null,
		vendor:
			typeof script.vendor === 'string' && isVendorId(script.vendor)
				? script.vendor
				: null,
	}));
};

export interface ElementIdResolver {
	resolve: (script: Script) => string;
	clear: () => void;
}

export const createElementIdResolver =
	function createElementIdResolver(): ElementIdResolver {
		return {
			clear() {
			},
			resolve(script) {
				const key = script.resourceKey ?? script.id;
				const anonymize = script.anonymizeId !== false;
				if (!anonymize) {
					return `c15t-script-${key}`;
				}
				const cached = anonymizedElementIds.get(key);
				if (cached) {
					return cached;
				}
				const generated = `c15t-${generateRandomId()}`;
				anonymizedElementIds.set(key, generated);
				return generated;
			},
		};
	};

export const hasSameResource = (previous: Script, next: Script): boolean => {
	const fields = [
		'resourceKey',
		'src',
		'textContent',
		'callbackOnly',
		'anonymizeId',
		'target',
		'async',
		'defer',
		'nonce',
		'fetchPriority',
	] as const;
	const attributes = previous.attributes ?? {};
	const nextAttributes = next.attributes ?? {};
	return (
		fields.every((field) => previous[field] === next[field]) &&
		Object.keys(attributes).length === Object.keys(nextAttributes).length &&
		Object.entries(attributes).every(
			([key, value]) => nextAttributes[key] === value
		)
	);
};
