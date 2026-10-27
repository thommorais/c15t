import type { ConsentSnapshot, KernelIABAuthority } from '@c15t/core';

import { additionalConsentFor } from './tcf/additional-consent';
import type { PublisherRestriction } from './tcf/iab-tcf-types';
import { sameListedRestrictions } from './tcf/publisher-restrictions';
import { decodeTCString } from './tcf/tc-string';
import type { DecodedTCString } from './tcf/tc-string';

export const AUTHORITY_KEY = 'c15t-iab-authority-v1';
const RETENTION_MS = 395 * 86_400_000;
const DISCLOSURE_REQUIRED_AT = Date.UTC(2026, 1, 28);

interface StoredAuthority {
	tcString: string;
	confirmedAt: number;
	expiresAt: number;
	choiceFingerprint: string;
	customConsents: Record<string, boolean>;
	customLegitimateInterests: Record<string, boolean>;
	adTechProviderConsents: Record<string, boolean>;
}

const ownBooleanMap = function ownBooleanMap(
	value: unknown
): Record<string, boolean> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return {};
	}
	return Object.fromEntries(
		Object.entries(value).filter(([, entry]) => typeof entry === 'boolean')
	);
};

export const readAuthorityReceiptText = function readAuthorityReceiptText():
	| string
	| null {
	try {
		return localStorage.getItem(AUTHORITY_KEY);
	} catch {
		return null;
	}
};

export const readAuthorityReceipt = function readAuthorityReceipt(
	text = readAuthorityReceiptText()
): unknown {
	try {
		return JSON.parse(text ?? 'null');
	} catch {
		return null;
	}
};

export const storeAuthority = function storeAuthority(
	authority: KernelIABAuthority
): void {
	try {
		localStorage.setItem(
			AUTHORITY_KEY,
			JSON.stringify({
				...authority,
				customConsents: authority.vendorConsents,
				customLegitimateInterests: authority.vendorLegitimateInterests,
			})
		);
	} catch {
	}
};

export const createAuthorityReceipt = function createAuthorityReceipt(
	snapshot: ConsentSnapshot,
	tcString: string,
	confirmedAt: number
): StoredAuthority {
	const providerChoices = snapshot.iab?.adTechProviderConsents ?? {};
	return {
		adTechProviderConsents: Object.fromEntries(
			(snapshot.iab?.adTechProviders ?? []).map(({ id }) => [
				String(id),
				providerChoices[String(id)] === true,
			])
		),
		choiceFingerprint: snapshot.evaluationPolicy.choice.fingerprint,
		confirmedAt,
		customConsents: { ...snapshot.iab?.vendorConsents },
		customLegitimateInterests: { ...snapshot.iab?.vendorLegitimateInterests },
		expiresAt:
			confirmedAt +
			Math.min(
				snapshot.evaluationPolicy.choice.maxAgeMs ?? RETENTION_MS,
				RETENTION_MS
			),
		tcString,
	};
};

const readReceipt = function readReceipt(
	value: Record<string, unknown>,
	snapshot: ConsentSnapshot,
	now: number
): StoredAuthority | null {
	const { tcString, confirmedAt, expiresAt, choiceFingerprint } = value;
	if (
		typeof tcString !== 'string' ||
		typeof confirmedAt !== 'number' ||
		typeof expiresAt !== 'number' ||
		!Number.isSafeInteger(confirmedAt) ||
		!Number.isSafeInteger(expiresAt) ||
		confirmedAt < 0 ||
		confirmedAt > now ||
		expiresAt <= now ||
		expiresAt <= confirmedAt ||
		choiceFingerprint !== snapshot.evaluationPolicy.choice.fingerprint ||
		expiresAt >
			confirmedAt +
				Math.min(
					snapshot.evaluationPolicy.choice.maxAgeMs ?? RETENTION_MS,
					RETENTION_MS
				)
	) {
		return null;
	}
	return {
		adTechProviderConsents: ownBooleanMap(value.adTechProviderConsents),
		choiceFingerprint,
		confirmedAt,
		customConsents: ownBooleanMap(value.customConsents),
		customLegitimateInterests: ownBooleanMap(value.customLegitimateInterests),
		expiresAt,
		tcString,
	};
};

const compatibleTC = function compatibleTC(
	decoded: DecodedTCString,
	receipt: StoredAuthority,
	snapshot: ConsentSnapshot
): boolean {
	const updatedAt = decoded.lastUpdated.getTime();
	if (
		!Number.isFinite(updatedAt) ||
		updatedAt < 0 ||
		updatedAt > receipt.confirmedAt ||
		receipt.confirmedAt - updatedAt >= 86_400_000 ||
		decoded.created.getTime() !== updatedAt ||
		decoded.cmpId !== snapshot.iab?.cmpId ||
		decoded.policyVersion !== snapshot.iab?.gvl?.tcfPolicyVersion ||
		decoded.vendorListVersion > (snapshot.iab?.gvl?.vendorListVersion ?? 0)
	) {
		return false;
	}
	if (updatedAt < DISCLOSURE_REQUIRED_AT) {
		return true;
	}
	return (
		receipt.tcString.includes('.') &&
		[
			...Object.keys(decoded.vendorConsents),
			...Object.keys(decoded.vendorLegitimateInterests),
		].every((id) => decoded.vendorsDisclosed[Number(id)] === true)
	);
};

const listedRestrictions = function listedRestrictions(
	restrictions: readonly PublisherRestriction[],
	vendors: Record<string, unknown> | undefined
): PublisherRestriction[] {
	return restrictions
		.map((restriction) => ({
			...restriction,
			vendorIds: restriction.vendorIds.filter((id) =>
				Object.hasOwn(vendors ?? {}, id)
			),
		}))
		.filter((restriction) => restriction.vendorIds.length > 0);
};

const adTechProviderAuthority = function adTechProviderAuthority(
	stored: Record<string, boolean>,
	snapshot: ConsentSnapshot,
	purposeConsents: Record<number, boolean>
): Pick<KernelIABAuthority, 'adTechProviderConsents' | 'addtlConsent'> {
	const providers = snapshot.iab?.adTechProviders;
	if (!providers?.length) {
		return {};
	}
	const adTechProviderConsents: Record<string, boolean> = {};
	for (const { id } of providers) {
		const key = String(id);
		if (Object.hasOwn(stored, key)) {
			adTechProviderConsents[key] = stored[key] === true;
		}
	}
	const addtlConsent = additionalConsentFor(
		adTechProviderConsents,
		purposeConsents
	);
	return addtlConsent
		? { adTechProviderConsents, addtlConsent }
		: { adTechProviderConsents };
};

export interface AuthorityCheck {
	authority: KernelIABAuthority | null;
	restrictionsChanged: boolean;
}

export const checkAuthority = async function checkAuthority(
	input: unknown,
	snapshot: ConsentSnapshot,
	now: number,
	publisherRestrictions: readonly PublisherRestriction[]
): Promise<AuthorityCheck> {
	const rejected = { authority: null, restrictionsChanged: false };
	if (
		!input ||
		typeof input !== 'object' ||
		Array.isArray(input) ||
		snapshot.resolution.status !== 'matched' ||
		snapshot.model !== 'iab' ||
		!snapshot.iab?.enabled
	) {
		return rejected;
	}
	const receipt = readReceipt(input as Record<string, unknown>, snapshot, now);
	if (!receipt) {
		return rejected;
	}
	const { tcString, confirmedAt, expiresAt, choiceFingerprint } = receipt;
	try {
		const decoded = await decodeTCString(tcString);
		const restrictionsChanged = !sameListedRestrictions(
			decoded.publisherRestrictions,
			publisherRestrictions,
			snapshot.iab.gvl?.vendors
		);
		if (restrictionsChanged || !compatibleTC(decoded, receipt, snapshot)) {
			return { authority: null, restrictionsChanged };
		}
		const vendorConsents = { ...decoded.vendorConsents };
		const vendorLegitimateInterests = { ...decoded.vendorLegitimateInterests };
		const { customConsents } = receipt;
		const customLI = receipt.customLegitimateInterests;
		for (const vendor of snapshot.iab.customVendors) {
			const id = String(vendor.id);
			if (Object.hasOwn(snapshot.iab.gvl?.vendors ?? {}, id)) {
				continue;
			}
			Object.defineProperty(vendorConsents, id, {
				enumerable: true,
				value: customConsents[id] === true && Object.hasOwn(customConsents, id),
			});
			Object.defineProperty(vendorLegitimateInterests, id, {
				enumerable: true,
				value: customLI[id] === true && Object.hasOwn(customLI, id),
			});
		}
		const authority: KernelIABAuthority = {
			...adTechProviderAuthority(
				receipt.adTechProviderConsents,
				snapshot,
				decoded.purposeConsents
			),
			choiceFingerprint,
			confirmedAt,
			expiresAt,
			publisherRestrictions: listedRestrictions(
				decoded.publisherRestrictions,
				snapshot.iab.gvl?.vendors
			),
			purposeConsents: decoded.purposeConsents,
			purposeLegitimateInterests: decoded.purposeLegitimateInterests,
			specialFeatureOptIns: decoded.specialFeatureOptIns,
			tcString,
			vendorConsents,
			vendorLegitimateInterests,
		};
		return { authority, restrictionsChanged: false };
	} catch {
		return rejected;
	}
};

export const validateAuthority = async function validateAuthority(
	input: unknown,
	snapshot: ConsentSnapshot,
	now: number,
	publisherRestrictions: readonly PublisherRestriction[]
): Promise<KernelIABAuthority | null> {
	return (await checkAuthority(input, snapshot, now, publisherRestrictions))
		.authority;
};

export const clearAuthorityReceipt = function clearAuthorityReceipt(
	expected?: string
): void {
	try {
		if (
			expected === undefined ||
			localStorage.getItem(AUTHORITY_KEY) === expected
		) {
			localStorage.removeItem(AUTHORITY_KEY);
		}
	} catch {
	}
};
