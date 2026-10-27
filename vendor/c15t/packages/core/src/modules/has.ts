import { evaluateConsentRecord } from '../consent-record/evaluate';
import type { AllConsentNames } from '../consent/consent-types';
import { extractConsentNamesFromCondition, has } from '../libs/has';
import type { HasCondition } from '../libs/has';
import { isProductionBuild } from '../libs/is-production';
import type { PublisherRestriction } from '../options/iab-tcf';
import type { ConsentSnapshot } from '../types';

export type { HasCondition };
export { extractConsentNamesFromCondition, has };

export interface IABConsentInputs {
	vendorConsents: Record<string, boolean>;
	vendorLegitimateInterests: Record<string, boolean>;
	purposeConsents: Record<number, boolean>;
	purposeLegitimateInterests: Record<number, boolean>;
	specialFeatureOptIns: Record<number, boolean>;
	publisherRestrictions?: readonly PublisherRestriction[];
}

export interface IABVendorDeclaration {
	flexiblePurposes?: readonly number[];
}

const registeredVendorId = function registeredVendorId(
	vendorId: IABTarget['vendorId']
): number | null {
	const id = Number(vendorId);
	return Number.isSafeInteger(id) && id > 0 && String(id) === String(vendorId)
		? id
		: null;
};

const CONSENT_ONLY_PURPOSES = new Set([1, 3, 4, 5, 6]);

interface LegalBases {
	consent: number[];
	legitimateInterest: number[];
}

const restrictLegalBases = function restrictLegalBases(
	target: IABTarget,
	restrictions: readonly PublisherRestriction[] | undefined,
	declaration: IABVendorDeclaration | undefined
): LegalBases | null {
	const consent = [...(target.iabPurposes ?? [])];
	const legitimateInterest = [...(target.iabLegIntPurposes ?? [])];
	const vendorId = registeredVendorId(target.vendorId);
	if (vendorId === null || !restrictions?.length) {
		return { consent, legitimateInterest };
	}
	const typeFor = (purposeId: number): number | undefined => {
		let type: number | undefined;
		for (const restriction of restrictions) {
			if (
				restriction.purposeId === purposeId &&
				restriction.vendorIds.includes(vendorId)
			) {
				type =
					type === undefined || type === restriction.restrictionType
						? restriction.restrictionType
						: 0;
			}
		}
		return type;
	};
	const flexible = (purposeId: number) =>
		declaration?.flexiblePurposes?.includes(purposeId) === true;
	const bases: LegalBases = { consent: [], legitimateInterest: [] };
	for (const purposeId of consent) {
		const type = typeFor(purposeId);
		if (type === 0) {
			return null;
		}
		if (type === 2) {
			if (!flexible(purposeId) || CONSENT_ONLY_PURPOSES.has(purposeId)) {
				return null;
			}
			bases.legitimateInterest.push(purposeId);
		} else {
			bases.consent.push(purposeId);
		}
	}
	for (const purposeId of legitimateInterest) {
		const type = typeFor(purposeId);
		if (type === 0) {
			return null;
		}
		if (type === 1) {
			if (!flexible(purposeId)) {
				return null;
			}
			bases.consent.push(purposeId);
		} else {
			bases.legitimateInterest.push(purposeId);
		}
	}
	return bases;
};

const usesOnlyLegitimateInterest = function usesOnlyLegitimateInterest(
	target: IABTarget,
	restrictions: readonly PublisherRestriction[] | undefined,
	declaration: IABVendorDeclaration | undefined
): boolean {
	const bases = restrictLegalBases(target, restrictions, declaration);
	return (
		bases !== null &&
		bases.consent.length === 0 &&
		bases.legitimateInterest.length > 0 &&
		!target.iabSpecialFeatures?.length
	);
};

export interface IABTarget {
	vendorId?: number | string;
	iabPurposes?: number[];
	iabLegIntPurposes?: number[];
	iabSpecialFeatures?: number[];
}

export const hasIABConsent = function hasIABConsent(
	target: IABTarget,
	iab: IABConsentInputs,
	declaration?: IABVendorDeclaration
): boolean {
	const bases = restrictLegalBases(
		target,
		iab.publisherRestrictions,
		declaration
	);
	if (!bases) {
		return false;
	}
	if (target.vendorId !== undefined) {
		const key = String(target.vendorId);
		const needsLI = bases.legitimateInterest.length > 0;
		const needsConsent = !needsLI || bases.consent.length > 0;
		if (
			needsLI &&
			(!Object.hasOwn(iab.vendorLegitimateInterests, key) ||
				iab.vendorLegitimateInterests[key] !== true)
		) {
			return false;
		}
		if (
			needsConsent &&
			(!Object.hasOwn(iab.vendorConsents, key) ||
				iab.vendorConsents[key] !== true)
		) {
			return false;
		}
	}
	return (
		bases.consent.every(
			(id) =>
				Object.hasOwn(iab.purposeConsents, id) &&
				iab.purposeConsents[id] === true
		) &&
		bases.legitimateInterest.every(
			(id) =>
				Object.hasOwn(iab.purposeLegitimateInterests, id) &&
				iab.purposeLegitimateInterests[id] === true
		) &&
		(target.iabSpecialFeatures ?? []).every(
			(id) =>
				Object.hasOwn(iab.specialFeatureOptIns, id) &&
				iab.specialFeatureOptIns[id] === true
		)
	);
};

export interface ConsentGate<
	CategoryType extends AllConsentNames = AllConsentNames,
> extends IABTarget {
	category: HasCondition<CategoryType>;
	vendor?: string;
}

export const deniedVendorIds = function deniedVendorIds(
	snapshot: Pick<ConsentSnapshot, 'vendorChoice' | 'vendors'>
): ReadonlySet<string> | null {
	const denied = snapshot.vendorChoice?.denied;
	if (!denied || denied.length === 0) {
		return null;
	}
	const toggleable = new Set<string>();
	for (const vendor of snapshot.vendors?.declared ?? []) {
		if (vendor.disabled !== true) {
			toggleable.add(vendor.id);
		}
	}
	const ids = new Set<string>();
	for (const id of denied) {
		if (toggleable.has(id)) {
			ids.add(id);
		}
	}
	return ids.size > 0 ? ids : null;
};

export const isVendorDenied = function isVendorDenied(
	snapshot: Pick<ConsentSnapshot, 'vendorChoice' | 'vendors'>,
	vendor: string
): boolean {
	return deniedVendorIds(snapshot)?.has(vendor) ?? false;
};

export const getEffectiveGateState = function getEffectiveGateState(
	snapshot: ConsentSnapshot,
	now = Date.now()
): Pick<ConsentSnapshot, 'effectivePermissions' | 'restrictions'> {
	if (snapshot.nextDeadline === null || now < snapshot.nextDeadline) {
		return snapshot;
	}
	const evaluation = evaluateConsentRecord({
		choice: snapshot.explicitChoice,
		gpc: snapshot.privacySignals.gpc.active,
		noticeDismissal: snapshot.noticeDismissal,
		now,
		policy: snapshot.evaluationPolicy,
	});
	return {
		effectivePermissions: evaluation.permissions,
		restrictions: evaluation.restrictions,
	};
};

const vendorDeclaration = function vendorDeclaration(
	snapshot: ConsentSnapshot,
	vendorId: IABTarget['vendorId']
): IABVendorDeclaration | undefined {
	const vendors = snapshot.iab?.gvl?.vendors;
	const key = String(vendorId);
	return vendorId !== undefined && vendors && Object.hasOwn(vendors, key)
		? vendors[key]
		: undefined;
};

const hasCurrentIABAuthority = function hasCurrentIABAuthority(
	snapshot: ConsentSnapshot,
	now: number
): boolean {
	const { iab } = snapshot;
	const authority = iab?.authority;
	if (
		!iab?.enabled ||
		!authority ||
		snapshot.resolution.status !== 'matched' ||
		authority.choiceFingerprint !==
			snapshot.evaluationPolicy.choice.fingerprint ||
		!authority.tcString ||
		!Number.isSafeInteger(authority.confirmedAt) ||
		!Number.isSafeInteger(authority.expiresAt) ||
		authority.confirmedAt < 0 ||
		authority.confirmedAt > now ||
		authority.expiresAt <= now ||
		authority.expiresAt <= authority.confirmedAt
	) {
		return false;
	}
	return true;
};

export const evaluateConsent = function evaluateConsent<
	CategoryType extends AllConsentNames,
>(
	target: ConsentGate<CategoryType>,
	snapshot: ConsentSnapshot,
	now = Date.now()
): boolean {
	const effective = getEffectiveGateState(snapshot, now);
	const hasIABFields =
		target.vendorId !== undefined ||
		target.iabPurposes?.length ||
		target.iabLegIntPurposes?.length ||
		target.iabSpecialFeatures?.length;

	if (hasIABFields) {
		if (snapshot.model !== 'iab') {
			return false;
		}
		const { iab } = snapshot;
		const authority = iab?.authority;
		if (!authority || !hasCurrentIABAuthority(snapshot, now)) {
			return false;
		}
		const declaration = vendorDeclaration(snapshot, target.vendorId);
		const ignoreRefusal = usesOnlyLegitimateInterest(
			target,
			authority.publisherRestrictions,
			declaration
		);
		for (const category of extractConsentNamesFromCondition<AllConsentNames>(
			target.category
		)) {
			if (
				category !== 'necessary' &&
				effective.restrictions[category]?.some(
					(reason) => !(ignoreRefusal && reason === 'explicit-denial')
				)
			) {
				return false;
			}
		}
		return hasIABConsent(target, authority, declaration);
	}

	const allowed = has(target.category, effective.effectivePermissions);
	if (!allowed || target.vendor === undefined || snapshot.model === 'iab') {
		return allowed;
	}
	return !isVendorDenied(snapshot, target.vendor);
};

const warnedUndeclaredVendors = new Set<string>();

const warnUndeclaredVendor = function warnUndeclaredVendor(
	vendorId: string
): void {
	if (isProductionBuild() || warnedUndeclaredVendors.has(vendorId)) {
		return;
	}
	warnedUndeclaredVendors.add(vendorId);
	console.warn(
		`[c15t] Vendor "${vendorId}" is not declared, so it reads as not allowed. Add { id: '${vendorId}', category: ... } to the vendors option, or put vendor: '${vendorId}' on the script that loads it.`
	);
};

export const isVendorAllowed = function isVendorAllowed(
	snapshot: ConsentSnapshot,
	vendorId: string,
	now = Date.now()
): boolean {
	const vendor = snapshot.vendors?.declared.find(
		(entry) => entry.id === vendorId
	);
	if (!vendor) {
		if (!snapshot.policyPending) {
			warnUndeclaredVendor(vendorId);
		}
		return false;
	}
	if (snapshot.model !== 'iab' && isVendorDenied(snapshot, vendorId)) {
		return false;
	}
	try {
		return evaluateConsent({ category: vendor.category }, snapshot, now);
	} catch {
		return false;
	}
};
