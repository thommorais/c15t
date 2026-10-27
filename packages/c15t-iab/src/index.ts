import { c15tProtocolParams, registerIABControls } from '@c15t/core';
import type {
	AdditionalConsentConfig,
	AdTechProvider,
	CMPApi,
	ConsentKernel,
	ConsentSnapshot,
	ExplicitChoice,
	GlobalVendorList,
	KernelIABAuthority,
	KernelIABState,
	NonIABVendor,
} from '@c15t/core';
import { appendInitParams } from '@c15t/schema/types';

import {
	AUTHORITY_KEY,
	checkAuthority,
	clearAuthorityReceipt,
	createAuthorityReceipt,
	readAuthorityReceipt,
	readAuthorityReceiptText,
	storeAuthority,
	validateAuthority,
} from './authority';
import {
	applyPublisherRestrictionsToGVL,
	introducedLegitimateInterest,
} from './headless/effective-vendor-list';
import {
	AD_TECH_PROVIDER_PURPOSES,
	fetchAdTechProviders,
} from './tcf/additional-consent';
import {
	clearStoredTCString,
	createCMPApi,
	syncStoredAdditionalConsent,
} from './tcf/cmp-api';
import { CMP_VERSION_NUMBER } from './tcf/cmp-defaults';
import { assertValidCmpId, createCmpIdError, isValidCmpId } from './tcf/cmp-id';
import { clearGVLCache, fetchGVL, narrowGVLToVendors } from './tcf/fetch-gvl';
import type { PublisherRestriction } from './tcf/iab-tcf-types';
import { getTCFCore } from './tcf/lazy-load';
import {
	copyPublisherRestrictionInput,
	PublisherRestrictionError,
	validatePublisherRestrictions,
} from './tcf/publisher-restrictions';
import {
	C15T_TO_IAB_PURPOSE_MAP,
	c15tConsentsToIabPurposes,
	iabPurposesToC15tConsents,
} from './tcf/purpose-mapping';
import { destroyIABStub as destroyStub, initializeIABStub } from './tcf/stub';
import { generateTCString, resolveIsServiceSpecific } from './tcf/tc-string';

export interface CreateIABOptions {
	kernel: ConsentKernel;
	cmpId: number;
	cmpVersion?: number;
	vendors?: number[];
	customVendors?: NonIABVendor[];
	additionalConsent?: AdditionalConsentConfig;
	publisherCountryCode?: string;
	isServiceSpecific?: boolean;
	publisherRestrictions?: PublisherRestriction[];
	persistence?: boolean;
	gvl?: GlobalVendorList | null;
	gvlURL?: string;
}

export type IABUserConfig = Omit<CreateIABOptions, 'cmpId' | 'kernel'> & {
	cmpId?: number;
};

export interface IABProviderConfig extends IABUserConfig {
	enabled: true;
}

const createIABProviderConfig = function createIABProviderConfig(
	config: IABUserConfig
): IABProviderConfig {
	if (config.cmpId !== undefined && !isValidCmpId(config.cmpId)) {
		throw createCmpIdError(config.cmpId);
	}
	return {
		...config,
		enabled: true,
	};
};

export { createIABProviderConfig as iab };
export { initializeIABStub, destroyIABStub } from './tcf/stub';
export type { PublisherRestriction } from './tcf/iab-tcf-types';
export {
	CONSENT_ONLY_PURPOSES,
	PUBLISHER_RESTRICTION_TYPES,
	PublisherRestrictionError,
	validatePublisherRestrictions,
} from './tcf/publisher-restrictions';
export type { PublisherRestrictionContext } from './tcf/publisher-restrictions';

export interface IABHandle {
	whenReady: () => Promise<void>;
	dispose: () => void;
	readonly cmpApi: CMPApi | null;
	setVendorConsent: (vendorId: string | number, value: boolean) => void;
	setVendorLegitimateInterest: (
		vendorId: string | number,
		value: boolean
	) => void;
	setPurposeConsent: (purposeId: number, value: boolean) => void;
	setPurposeLegitimateInterest: (purposeId: number, value: boolean) => void;
	setSpecialFeatureOptIn: (featureId: number, value: boolean) => void;
	setAdTechProviderConsent: (providerId: number, value: boolean) => void;
	acceptAll: () => void;
	rejectAll: () => void;
	generateTCString: () => Promise<string>;
	save: () => Promise<void>;
}

const seedInitialIAB = function seedInitialIAB(
	kernel: ConsentKernel,
	options: CreateIABOptions,
	gvl: GlobalVendorList | null,
	publisherRestrictions: PublisherRestriction[]
): void {
	let reference =
		options.gvl === undefined
			? kernel.getSnapshot().iab?.gvlReference
			: undefined;
	if (reference && options.vendors?.length) {
		reference = { ...reference, summary: undefined };
	}
	kernel.set.iab({
		cmpId: options.cmpId,
		customVendors:
			options.customVendors ?? kernel.getSnapshot().iab?.customVendors ?? [],
		enabled:
			gvl !== null ||
			(options.gvl === undefined &&
				Boolean(kernel.getSnapshot().iab?.gvlReference)),
		gvl,
		gvlReference: reference,
		publisherRestrictions,
	});
};

const readIAB = function readIAB(kernel: ConsentKernel) {
	return (
		kernel.getSnapshot().iab ?? {
			authority: null,
			cmpId: null as number | null,
			customVendors: [] as NonIABVendor[],
			enabled: false,
			gvl: null as GlobalVendorList | null,
			purposeConsents: {} as Record<number, boolean>,
			purposeLegitimateInterests: {} as Record<number, boolean>,
			specialFeatureOptIns: {} as Record<number, boolean>,
			tcString: null as string | null,
			vendorConsents: {} as Record<string, boolean>,
			vendorLegitimateInterests: {} as Record<string, boolean>,
		}
	);
};

const adTechProviderPurposes = (
	providers: readonly AdTechProvider[] | null | undefined
): readonly number[] => (providers?.length ? AD_TECH_PROVIDER_PURPOSES : []);

const applyBlanket = function applyBlanket(
	kernel: ConsentKernel,
	gvl: GlobalVendorList,
	value: boolean,
	restrictions: readonly PublisherRestriction[] = []
): void {
	const vendors = [
		...Object.values(
			applyPublisherRestrictionsToGVL(gvl, restrictions).vendors ?? {}
		),
		...readIAB(kernel).customVendors,
	];
	const purposeIds = Object.keys(gvl.purposes ?? {}).map(Number);
	const specialFeatureIds = Object.keys(gvl.specialFeatures ?? {}).map(Number);
	const declared = (
		pick: (vendor: (typeof vendors)[number]) => number[] | undefined
	) => new Set(vendors.flatMap((vendor) => pick(vendor) ?? []));
	const consentPurposes = declared((vendor) => vendor.purposes);
	for (const id of adTechProviderPurposes(readIAB(kernel).adTechProviders)) {
		consentPurposes.add(id);
	}
	const legitimateInterestPurposes = declared(
		(vendor) => vendor.legIntPurposes
	);
	const declaredSpecialFeatures = declared((vendor) => vendor.specialFeatures);
	const vendorConsents: Record<string, boolean> = Object.fromEntries(
		vendors.map((vendor) => [
			String(vendor.id),
			value && vendor.purposes.length > 0,
		])
	);
	const vendorLegitimateInterests: Record<string, boolean> = Object.fromEntries(
		vendors.map((vendor) => [
			String(vendor.id),
			value && (vendor.legIntPurposes?.length ?? 0) > 0,
		])
	);
	const purposeConsents: Record<number, boolean> = {};
	const purposeLegitimateInterests: Record<number, boolean> = {};
	for (const id of purposeIds) {
		purposeConsents[id] = value && consentPurposes.has(id);
		purposeLegitimateInterests[id] =
			value && legitimateInterestPurposes.has(id);
	}
	const specialFeatureOptIns: Record<number, boolean> = {};
	for (const id of specialFeatureIds) {
		specialFeatureOptIns[id] = value && declaredSpecialFeatures.has(id);
	}
	const adTechProviderConsents: Record<string, boolean> = Object.fromEntries(
		(readIAB(kernel).adTechProviders ?? []).map(({ id }) => [String(id), value])
	);

	kernel.set.iab({
		adTechProviderConsents,
		purposeConsents,
		purposeLegitimateInterests,
		specialFeatureOptIns,
		vendorConsents,
		vendorLegitimateInterests,
	});
};

const restrictionsForDisplay = function restrictionsForDisplay(
	input: unknown
): PublisherRestriction[] {
	try {
		return validatePublisherRestrictions(input);
	} catch {
		return [];
	}
};

const consentBasisPurposes = function consentBasisPurposes(
	gvl: GlobalVendorList,
	restrictions: readonly PublisherRestriction[],
	customVendors: readonly NonIABVendor[],
	adTechProviders: readonly AdTechProvider[] | null | undefined
): Set<number> {
	return new Set([
		...[
			...Object.values(
				applyPublisherRestrictionsToGVL(gvl, restrictions).vendors ?? {}
			),
			...customVendors,
		].flatMap((vendor) => vendor.purposes ?? []),
		...adTechProviderPurposes(adTechProviders),
	]);
};

const receiptIdentity = function receiptIdentity(value: unknown): string {
	if (!value || typeof value !== 'object') {
		return '';
	}
	const {
		tcString,
		confirmedAt,
		customConsents,
		customLegitimateInterests,
		adTechProviderConsents,
	} = value as Record<string, unknown>;
	return JSON.stringify([
		tcString,
		confirmedAt,
		customConsents,
		customLegitimateInterests,
		adTechProviderConsents,
	]);
};

const sameConfirmationContext = function sameConfirmationContext(
	left: ConsentSnapshot,
	right: ConsentSnapshot
): boolean {
	return (
		left.evaluationPolicy.choice.fingerprint ===
			right.evaluationPolicy.choice.fingerprint &&
		left.iab === right.iab &&
		left.subject === right.subject &&
		left.user === right.user &&
		left.explicitChoice === right.explicitChoice
	);
};

const changedIABDraft = function changedIABDraft(
	previous: ConsentSnapshot,
	current: ConsentSnapshot
): boolean {
	return (
		current.iab !== previous.iab &&
		current.iab?.gvl === previous.iab?.gvl &&
		current.iab?.enabled === previous.iab?.enabled &&
		current.iab?.gvlReference === previous.iab?.gvlReference &&
		current.iab?.adTechProviders === previous.iab?.adTechProviders &&
		!current.iab?.authority
	);
};

const grantsDeniedCategory = function grantsDeniedCategory(
	authority: KernelIABAuthority,
	choice: ExplicitChoice | null
): boolean {
	if (!choice) {
		return false;
	}
	return Object.entries(choice.categories).some(([category, decision]) => {
		if (decision?.value !== false) {
			return false;
		}
		const purposes =
			C15T_TO_IAB_PURPOSE_MAP[category as keyof typeof C15T_TO_IAB_PURPOSE_MAP];
		const granted = (purpose: number) =>
			authority.purposeConsents[purpose] === true;
		return decision.confirmedAt > authority.confirmedAt
			? purposes.some(granted)
			: purposes.every(granted);
	});
};

const selectionsOf = function selectionsOf(authority: KernelIABAuthority) {
	return {
		adTechProviderConsents: { ...authority.adTechProviderConsents },
		purposeConsents: { ...authority.purposeConsents },
		purposeLegitimateInterests: { ...authority.purposeLegitimateInterests },
		specialFeatureOptIns: { ...authority.specialFeatureOptIns },
		vendorConsents: { ...authority.vendorConsents },
		vendorLegitimateInterests: { ...authority.vendorLegitimateInterests },
	};
};

const withoutDeniedPurposes = function withoutDeniedPurposes(
	purposeConsents: Record<number, boolean>,
	choice: ExplicitChoice
): Record<number, boolean> {
	const next = { ...purposeConsents };
	for (const [category, decision] of Object.entries(choice.categories)) {
		if (decision?.value !== false) {
			continue;
		}
		const purposes =
			C15T_TO_IAB_PURPOSE_MAP[category as keyof typeof C15T_TO_IAB_PURPOSE_MAP];
		for (const purpose of purposes ?? []) {
			next[purpose] = false;
		}
	}
	return next;
};

const predatesChoice = function predatesChoice(
	authority: KernelIABAuthority,
	choice: ExplicitChoice | null
): boolean {
	return Object.values(choice?.categories ?? {}).some(
		(decision) =>
			decision !== undefined && decision.confirmedAt > authority.confirmedAt
	);
};

const fitsChoice = function fitsChoice(
	authority: KernelIABAuthority,
	choice: ExplicitChoice | null
): boolean {
	return (
		!grantsDeniedCategory(authority, choice) &&
		!predatesChoice(authority, choice)
	);
};

const selectionText = function selectionText(
	map: Record<string, boolean>
): string {
	return JSON.stringify(
		Object.keys(map)
			.sort()
			.map((id) => [id, map[id]])
	);
};

const sameVendorSelections = function sameVendorSelections(
	left: KernelIABAuthority,
	right: KernelIABAuthority
): boolean {
	return (
		selectionText(left.vendorConsents) ===
			selectionText(right.vendorConsents) &&
		selectionText(left.vendorLegitimateInterests) ===
			selectionText(right.vendorLegitimateInterests) &&
		selectionText(left.adTechProviderConsents ?? {}) ===
			selectionText(right.adTechProviderConsents ?? {})
	);
};

const shouldInstallReceipt = function shouldInstallReceipt(
	receipt: KernelIABAuthority | null,
	held: KernelIABAuthority | null,
	heldUnfit: boolean,
	choice: ExplicitChoice
): receipt is KernelIABAuthority {
	if (!receipt || !fitsChoice(receipt, choice)) {
		return false;
	}
	if (held === null || heldUnfit) {
		return true;
	}
	return receipt.confirmedAt > held.confirmedAt;
};

const SELECTION_MAPS = [
	'adTechProviderConsents',
	'purposeConsents',
	'purposeLegitimateInterests',
	'specialFeatureOptIns',
	'vendorConsents',
	'vendorLegitimateInterests',
] as const;

const grantsBeyond = function grantsBeyond(
	authority: KernelIABAuthority,
	other: KernelIABAuthority
): boolean {
	return SELECTION_MAPS.some((name) => {
		const theirs = (other[name] ?? {}) as Record<string, boolean>;
		return Object.entries(authority[name] ?? {}).some(
			([id, granted]) => granted === true && theirs[id] !== true
		);
	});
};

const settleTie = function settleTie(
	receipt: KernelIABAuthority,
	held: KernelIABAuthority
): 'install' | 'store' | 'withdraw' {
	if (!grantsBeyond(receipt, held)) {
		return 'install';
	}
	return grantsBeyond(held, receipt) ? 'withdraw' : 'store';
};

const isTie = function isTie(
	receipt: KernelIABAuthority | null,
	held: KernelIABAuthority | null,
	choice: ExplicitChoice
): receipt is KernelIABAuthority {
	return Boolean(
		receipt &&
		held &&
		fitsChoice(receipt, choice) &&
		receipt.confirmedAt === held.confirmedAt &&
		(receipt.tcString !== held.tcString || !sameVendorSelections(receipt, held))
	);
};

const changedSelections = (
	previous: ConsentSnapshot,
	current: ConsentSnapshot
): boolean =>
	current.iab?.purposeConsents !== previous.iab?.purposeConsents ||
	current.iab?.purposeLegitimateInterests !==
		previous.iab?.purposeLegitimateInterests ||
	current.iab?.vendorConsents !== previous.iab?.vendorConsents ||
	current.iab?.vendorLegitimateInterests !==
		previous.iab?.vendorLegitimateInterests ||
	current.iab?.specialFeatureOptIns !== previous.iab?.specialFeatureOptIns ||
	current.iab?.adTechProviderConsents !== previous.iab?.adTechProviderConsents;

const changedReference = (
	previous: ConsentSnapshot['iab'],
	current: ConsentSnapshot['iab']
): boolean => {
	const before = previous?.gvlReference;
	const after = current?.gvlReference;
	return Boolean(
		after &&
		(!before ||
			after.url !== before.url ||
			after.language !== before.language ||
			after.vendorListVersion !== before.vendorListVersion ||
			after.format !== before.format ||
			after.context?.country !== before.context?.country ||
			after.context?.region !== before.context?.region ||
			after.context?.gpc !== before.context?.gpc)
	);
};

const referenceHeaders = (
	requested: NonNullable<ConsentSnapshot['iab']>['gvlReference']
): Record<string, string> | undefined =>
	requested ? { 'accept-language': requested.language } : undefined;

const referenceEndpoint = (
	requested: NonNullable<ConsentSnapshot['iab']>['gvlReference']
): string | undefined => {
	if (requested?.format !== 'init') {
		return requested?.url;
	}
	return appendInitParams(requested.url, {
		...c15tProtocolParams,
		country: requested.context?.country ?? undefined,
		gpc: requested.context?.gpc,
		region: requested.context?.region ?? undefined,
	});
};

const policyUsesIAB = (snapshot: ConsentSnapshot): boolean =>
	snapshot.policyRule.model === 'iab';

const cmpDisplayStatus = (snapshot: ConsentSnapshot): 'visible' | 'hidden' =>
	policyUsesIAB(snapshot) &&
	(snapshot.activeUI === 'banner' || snapshot.activeUI === 'dialog')
		? 'visible'
		: 'hidden';

const resolvePreloadedGvl = function resolvePreloadedGvl(
	kernel: ConsentKernel,
	options: CreateIABOptions
): GlobalVendorList | null | undefined {
	if (options.gvl !== undefined) {
		return options.gvl;
	}
	const snapshot = kernel.getSnapshot();
	const held = snapshot.iab?.gvl;
	if (held) {
		return options.vendors?.length
			? narrowGVLToVendors(held, options.vendors)
			: held;
	}
	const prepared = kernel.getServerSnapshot().iab;
	if (
		prepared &&
		prepared.gvl === null &&
		snapshot.policyRule.model !== 'iab'
	) {
		return null;
	}
	return undefined;
};

export const createIAB = function createIAB(
	options: CreateIABOptions
): IABHandle {
	const { kernel, cmpVersion = CMP_VERSION_NUMBER, vendors, gvlURL } = options;
	const cmpId = assertValidCmpId(options.cmpId);
	const isServiceSpecific = resolveIsServiceSpecific(options.isServiceSpecific);
	let publisherRestrictions: PublisherRestriction[] = [];
	const configuredRestrictions = copyPublisherRestrictionInput(
		options.publisherRestrictions
	);
	const restrictionsForBlanket = (gvl: GlobalVendorList) => {
		try {
			return validatePublisherRestrictions(configuredRestrictions, { gvl });
		} catch {
			return [];
		}
	};

	const preloadedGvl = resolvePreloadedGvl(kernel, options);
	let reference =
		options.gvl === undefined
			? kernel.getSnapshot().iab?.gvlReference
			: undefined;

	seedInitialIAB(
		kernel,
		options,
		preloadedGvl ?? null,
		restrictionsForDisplay(configuredRestrictions)
	);

	let cmpApi: CMPApi | null = null;
	let disposed = false;
	let authorityTimer: ReturnType<typeof setTimeout> | undefined;
	let confirmationGeneration = 0;
	let selectionRevision = 0;
	let revisionAtAuthority = 0;
	let ownSelectionRevisions = 0;
	const setOwnSelections = (update: Partial<KernelIABState>): void => {
		const revisionBefore = selectionRevision;
		kernel.set.iab(update);
		ownSelectionRevisions += selectionRevision - revisionBefore;
	};
	let keepReceipt = false;
	let ownSaveCommitting = false;
	let committingTcString: string | null = null;
	let suppressedAuthority: KernelIABAuthority | null = null;
	const armAuthorityTimer = function armAuthorityTimer(): void {
		clearTimeout(authorityTimer);
		const authority = kernel.getSnapshot().iab?.authority;
		if (!authority || disposed) {
			return;
		}
		const remaining = authority.expiresAt - Date.now();
		if (remaining <= 0) {
			kernel.set.iab({ authority: null });
			return;
		}
		authorityTimer = setTimeout(
			armAuthorityTimer,
			Math.min(remaining, 2_147_483_647)
		);
	};

	if (typeof window !== 'undefined' && typeof document !== 'undefined') {
		initializeIABStub();
	}

	const loadList = async (
		preloaded: GlobalVendorList | null | undefined,
		requested: typeof reference
	): Promise<GlobalVendorList | null> => {
		if (preloaded !== undefined) {
			return preloaded;
		}

		const list = await fetchGVL(vendors?.length ? vendors : undefined, {
			endpoint: referenceEndpoint(requested) ?? gvlURL,
			format: requested?.format,
			headers: referenceHeaders(requested),
		});
		if (
			requested &&
			(!list || list.vendorListVersion !== requested.vendorListVersion)
		) {
			throw new Error(
				'The IAB vendor list changed. Reload to review the current list.'
			);
		}
		return list && vendors?.length ? narrowGVLToVendors(list, vendors) : list;
	};

	const adTechProviderIds = options.additionalConsent?.providers ?? [];
	let adTechProviderRequest: Promise<AdTechProvider[] | null> | null = null;
	let adTechProvidersSettled = false;
	let clientAdTechProviders: AdTechProvider[] | null = null;
	const loadAdTechProviders = (
		preloaded: GlobalVendorList | null | undefined
	): Promise<AdTechProvider[] | null> => {
		if (!options.additionalConsent || preloaded === null) {
			return Promise.resolve(null);
		}
		if (adTechProviderIds.length === 0) {
			return Promise.resolve([]);
		}
		if (adTechProviderRequest) {
			return adTechProviderRequest;
		}
		adTechProvidersSettled = false;
		adTechProviderRequest = (async () => {
			try {
				return await fetchAdTechProviders(
					adTechProviderIds,
					options.additionalConsent?.url
				);
			} catch (error) {
				adTechProviderRequest = null;
				console.warn(
					'[c15t] Additional Consent is off: the ad tech provider list did not load.',
					error
				);
				return null;
			}
		})();
		return adTechProviderRequest;
	};

	let restoredFingerprint: string | null = null;
	let openedForRestrictions = false;
	let hydrationCancelled = false;
	const unchangedSince = function unchangedSince(
		before: ConsentSnapshot,
		recordsGeneration: number,
		generation: number
	): boolean {
		const current = kernel.getSnapshot();
		return (
			!disposed &&
			!hydrationCancelled &&
			generation === confirmationGeneration &&
			kernel.getRecordsGeneration() === recordsGeneration &&
			current.iab === before.iab &&
			current.explicitChoice === before.explicitChoice &&
			current.subject === before.subject &&
			current.evaluationPolicy.choice.fingerprint ===
				before.evaluationPolicy.choice.fingerprint
		);
	};
	const promptForChangedRestrictions = (...conditions: boolean[]): void => {
		const current = kernel.getSnapshot();
		if (
			conditions.every(Boolean) &&
			current.explicitChoice &&
			current.activeUI === 'none'
		) {
			openedForRestrictions = true;
			kernel.set.activeUI('banner');
		}
	};
	const restoreAuthority = async function restoreAuthority(): Promise<void> {
		if (options.persistence === false) {
			return;
		}
		const hydrationSnapshot = kernel.getSnapshot();
		const recordsGeneration = kernel.getRecordsGeneration();
		if (
			disposed ||
			hydrationCancelled ||
			hydrationSnapshot.iab?.authority ||
			!hydrationSnapshot.iab?.gvl ||
			hydrationSnapshot.model !== 'iab' ||
			hydrationSnapshot.resolution.status !== 'matched'
		) {
			return;
		}
		const { fingerprint } = hydrationSnapshot.evaluationPolicy.choice;
		if (restoredFingerprint === fingerprint) {
			return;
		}
		restoredFingerprint = fingerprint;
		const generation = confirmationGeneration;
		const checked = readAuthorityReceipt();
		const { authority, restrictionsChanged } = await checkAuthority(
			checked,
			hydrationSnapshot,
			Date.now(),
			publisherRestrictions
		);
		if (receiptIdentity(readAuthorityReceipt()) !== receiptIdentity(checked)) {
			restoredFingerprint = null;
			void restoreAuthority();
			return;
		}
		if (
			restrictionsChanged &&
			unchangedSince(hydrationSnapshot, recordsGeneration, generation)
		) {
			clearStoredTCString(String((checked as { tcString: unknown }).tcString));
			promptForChangedRestrictions();
		}
		if (
			authority &&
			unchangedSince(hydrationSnapshot, recordsGeneration, generation) &&
			fitsChoice(authority, hydrationSnapshot.explicitChoice)
		) {
			const keepSelections = selectionRevision !== revisionAtAuthority;
			setOwnSelections({
				...(!keepSelections && selectionsOf(authority)),
				authority,
				tcString: authority.tcString,
			});
			if (!keepSelections) {
				revisionAtAuthority = selectionRevision;
			}
			armAuthorityTimer();
		}
	};
	const withdrawAuthority = function withdrawAuthority(
		choice: ExplicitChoice | null
	): void {
		const keepSelections = selectionRevision !== revisionAtAuthority;
		const update: Partial<KernelIABState> = {
			authority: null,
			tcString: null,
		};
		if (!keepSelections && choice) {
			update.purposeConsents = withoutDeniedPurposes(
				readIAB(kernel).purposeConsents,
				choice
			);
		}
		keepReceipt = true;
		try {
			setOwnSelections(update);
		} finally {
			keepReceipt = false;
		}
		if (!keepSelections) {
			revisionAtAuthority = selectionRevision;
		}
		armAuthorityTimer();
	};
	const applyReconciledAuthority = function applyReconciledAuthority(
		receipt: KernelIABAuthority | null,
		choice: ExplicitChoice,
		receiptText: string | null
	): void {
		const held = readIAB(kernel).authority;
		const heldConflicts = held !== null && !fitsChoice(held, choice);
		const keepSelections = selectionRevision !== revisionAtAuthority;
		const tie =
			held && !heldConflicts && isTie(receipt, held, choice)
				? settleTie(receipt, held)
				: null;
		if (tie === 'store' && held) {
			if (options.persistence !== false) {
				storeAuthority(held);
			}
			return;
		}
		if (tie === 'withdraw') {
			withdrawAuthority(choice);
			if (receiptText !== null) {
				clearAuthorityReceipt(receiptText);
			}
			return;
		}
		if (
			receipt &&
			(tie === 'install' ||
				shouldInstallReceipt(receipt, held, heldConflicts, choice))
		) {
			const update: Partial<KernelIABState> = {
				authority: receipt,
				tcString: receipt.tcString,
			};
			if (!keepSelections) {
				Object.assign(update, selectionsOf(receipt));
			}
			setOwnSelections(update);
		} else if (heldConflicts) {
			withdrawAuthority(choice);
			return;
		} else {
			return;
		}
		if (!keepSelections) {
			revisionAtAuthority = selectionRevision;
		}
		armAuthorityTimer();
	};
	let listGeneration = 0;
	let publishedListGeneration = 0;
	let reloadAfterList = false;
	const reloadAuthority = async function reloadAuthority(): Promise<void> {
		const snapshot = kernel.getSnapshot();
		if (
			options.persistence === false ||
			disposed ||
			snapshot.model !== 'iab' ||
			snapshot.explicitChoice === null
		) {
			return;
		}
		const recordsGeneration = kernel.getRecordsGeneration();
		const generation = confirmationGeneration;
		const receiptText = readAuthorityReceiptText();
		const listLoading = publishedListGeneration !== listGeneration;
		if (listLoading) {
			reloadAfterList = true;
		}
		const receipt = listLoading
			? null
			: await validateAuthority(
					readAuthorityReceipt(receiptText),
					snapshot,
					Date.now(),
					publisherRestrictions
				);
		const current = kernel.getSnapshot();
		if (!listLoading && publishedListGeneration !== listGeneration) {
			reloadAfterList = true;
			return;
		}
		if (
			disposed ||
			generation !== confirmationGeneration ||
			kernel.getRecordsGeneration() !== recordsGeneration ||
			current.evaluationPolicy.choice.fingerprint !==
				snapshot.evaluationPolicy.choice.fingerprint ||
			!current.explicitChoice ||
			readAuthorityReceiptText() !== receiptText
		) {
			return;
		}
		applyReconciledAuthority(receipt, current.explicitChoice, receiptText);
		const kept = readIAB(kernel).authority;
		if (kept && kept === suppressedAuthority) {
			suppressedAuthority = null;
			cmpApi?.updateConsent(
				kept.tcString,
				undefined,
				policyUsesIAB(kernel.getSnapshot())
			);
		}
	};
	const unsubscribeSaveStart = kernel.events.on('command:save:started', () => {
		ownSaveCommitting = true;
		queueMicrotask(() => {
			ownSaveCommitting = false;
		});
	});
	const holdBackUntilReload = function holdBackUntilReload(
		held: KernelIABAuthority
	): void {
		suppressedAuthority = held;
		queueMicrotask(() => {
			void reloadAuthority();
		});
	};
	const noteChoiceChange = function noteChoiceChange(
		previous: ConsentSnapshot,
		snapshot: ConsentSnapshot
	): void {
		const held = snapshot.iab?.authority;
		if (!held || ownSaveCommitting) {
			return;
		}
		const choiceChanged =
			snapshot.explicitChoice !== previous.explicitChoice &&
			predatesChoice(held, snapshot.explicitChoice);
		const vendorsChanged =
			snapshot.vendorChoice !== previous.vendorChoice &&
			(snapshot.vendorChoice?.confirmedAt ?? 0) > held.confirmedAt;
		if (choiceChanged || vendorsChanged) {
			holdBackUntilReload(held);
		}
	};
	const onReceiptStored = function onReceiptStored(event: StorageEvent): void {
		const held = readIAB(kernel).authority;
		if (
			options.persistence === false ||
			!held ||
			(event.key !== AUTHORITY_KEY && event.key !== null)
		) {
			return;
		}
		const snapshot = kernel.getSnapshot();
		if (readAuthorityReceiptText() === null) {
			withdrawAuthority(snapshot.explicitChoice);
			return;
		}
		holdBackUntilReload(held);
		cmpApi?.updateConsent('', undefined, policyUsesIAB(snapshot));
	};
	if (typeof window !== 'undefined') {
		window.addEventListener('storage', onReceiptStored);
	}
	const publishedTcString = function publishedTcString(): string {
		const authority = kernel.getSnapshot().iab?.authority;
		return authority && authority !== suppressedAuthority
			? authority.tcString
			: '';
	};
	const markListPublished = (generation: number): void => {
		publishedListGeneration = generation;
		if (reloadAfterList) {
			reloadAfterList = false;
			void reloadAuthority();
		}
	};
	const unsubscribeClear = kernel.events.on('records:cleared', () => {
		openedForRestrictions = false;
		hydrationCancelled = true;
		confirmationGeneration += 1;
		clearAuthorityReceipt();
	});
	let publishedList = preloadedGvl ?? null;
	let initializationError: unknown;
	const retainedAuthorityMatchesList = async (
		snapshot: ConsentSnapshot,
		gvl: GlobalVendorList,
		adTechProviders: AdTechProvider[] | null
	): Promise<{
		checked: KernelIABAuthority | null;
		restrictionsChanged: boolean;
		valid: boolean;
	}> => {
		const { iab } = snapshot;
		const retained = iab?.authority;
		if (!retained || !iab) {
			return { checked: null, restrictionsChanged: false, valid: true };
		}
		const { authority, restrictionsChanged } = await checkAuthority(
			{
				...retained,
				customConsents: retained.vendorConsents,
				customLegitimateInterests: retained.vendorLegitimateInterests,
			},
			{
				...snapshot,
				iab: {
					...iab,
					adTechProviders: adTechProviders ?? iab.adTechProviders,
					gvl,
				},
			},
			Date.now(),
			publisherRestrictions
		);
		return {
			checked: authority,
			restrictionsChanged,
			valid: Boolean(authority),
		};
	};
	const refreshedProviderAuthority = (
		retained: KernelIABAuthority | null | undefined,
		checked: KernelIABAuthority | null
	): KernelIABAuthority | null => {
		if (
			!retained ||
			!checked ||
			retained.addtlConsent === checked.addtlConsent
		) {
			return null;
		}
		const { addtlConsent: _stale, ...rest } = retained;
		const refreshed: KernelIABAuthority = {
			...rest,
			adTechProviderConsents: checked.adTechProviderConsents,
		};
		if (checked.addtlConsent) {
			refreshed.addtlConsent = checked.addtlConsent;
		}
		return refreshed;
	};
	const retainedAuthorityPatch = (
		withdrawn: boolean,
		refreshed: KernelIABAuthority | null
	): Partial<KernelIABState> => {
		if (withdrawn) {
			return { authority: null, tcString: '' };
		}
		return refreshed ? { authority: refreshed } : {};
	};
	const publishListPatch = (
		gvl: GlobalVendorList,
		adTechProviders: AdTechProvider[] | null,
		withdrawn: boolean,
		refreshed: KernelIABAuthority | null
	): Partial<KernelIABState> => {
		const update: Partial<KernelIABState> = {
			enabled: true,
			gvl,
			gvlReference: undefined,
			...retainedAuthorityPatch(withdrawn, refreshed),
		};
		if (adTechProviders) {
			update.adTechProviders = adTechProviders;
			clientAdTechProviders = adTechProviders;
		}
		return update;
	};
	const retainedWithdrawn = (
		retained: KernelIABAuthority | null | undefined,
		valid: boolean
	): boolean => !valid && readIAB(kernel).authority === retained;
	let checkedAuthority: KernelIABAuthority | null | undefined;
	let checkedProviders: AdTechProvider[] | null | undefined;
	const noteChecked = (
		snapshot: ConsentSnapshot,
		update: Partial<KernelIABState>
	): void => {
		checkedProviders = update.adTechProviders ?? snapshot.iab?.adTechProviders;
		checkedAuthority =
			update.authority === undefined
				? snapshot.iab?.authority
				: update.authority;
	};
	const recheckProviders = async (): Promise<void> => {
		const snapshot = kernel.getSnapshot();
		const { iab } = snapshot;
		const retained = iab?.authority;
		const providers = iab?.adTechProviders;
		if (
			disposed ||
			!retained ||
			!iab.gvl ||
			publishedListGeneration !== listGeneration ||
			(retained === checkedAuthority && providers === checkedProviders)
		) {
			return;
		}
		const generation = confirmationGeneration;
		const list = listGeneration;
		const check = await retainedAuthorityMatchesList(snapshot, iab.gvl, null);
		const current = kernel.getSnapshot().iab;
		if (
			disposed ||
			generation !== confirmationGeneration ||
			list !== listGeneration ||
			current?.gvl !== iab.gvl ||
			current.adTechProviders !== providers
		) {
			return;
		}
		if (current.authority !== retained) {
			void recheckProviders();
			return;
		}
		const withdrawn = retainedWithdrawn(retained, check.valid);
		const update = retainedAuthorityPatch(
			withdrawn,
			refreshedProviderAuthority(retained, check.checked)
		);
		noteChecked(snapshot, update);
		if (update.authority && retained === suppressedAuthority) {
			suppressedAuthority = update.authority;
		}
		if (update.authority !== undefined) {
			kernel.set.iab(update);
		}
		promptForChangedRestrictions(withdrawn, check.restrictionsChanged);
	};
	const restrictionsForList = (gvl: GlobalVendorList) => {
		try {
			return validatePublisherRestrictions(configuredRestrictions, { gvl });
		} catch (error) {
			if (readIAB(kernel).authority) {
				kernel.set.iab({ authority: null, tcString: '' });
			}
			const stored = readAuthorityReceipt() as { tcString?: unknown } | null;
			if (
				options.persistence !== false &&
				typeof stored?.tcString === 'string'
			) {
				clearStoredTCString(stored.tcString);
			}
			throw error;
		}
	};
	const initialize = async (
		preloaded: GlobalVendorList | null | undefined,
		requested: typeof reference
	) => {
		listGeneration += 1;
		const generation = listGeneration;
		const initializationSnapshot = kernel.getSnapshot();
		initializationError = undefined;
		cmpApi?.updateVendorList(null);
		try {
			const [gvl, adTechProviders] = await Promise.all([
				loadList(preloaded, requested),
				loadAdTechProviders(preloaded),
			]);
			if (disposed || generation !== listGeneration) {
				return;
			}
			if (gvl === null) {
				kernel.set.iab({ enabled: false, gvl: null });
				return;
			}
			publisherRestrictions = restrictionsForList(gvl);
			const beforePublish = kernel.getSnapshot();
			const retained = beforePublish.iab?.authority;
			const retainedCheck = await retainedAuthorityMatchesList(
				beforePublish,
				gvl,
				adTechProviders
			);
			if (disposed || generation !== listGeneration) {
				return;
			}
			const mayHydrate =
				kernel.getSnapshot().iab === initializationSnapshot.iab;
			const withdrawn = retainedWithdrawn(retained, retainedCheck.valid);
			const update = publishListPatch(
				gvl,
				adTechProviders,
				withdrawn,
				refreshedProviderAuthority(retained, retainedCheck.checked)
			);
			noteChecked(beforePublish, update);
			const existingApi = cmpApi;
			existingApi?.updateVendorList(gvl);
			publishedList = gvl;
			const beforeUpdate = kernel.getSnapshot();
			kernel.set.iab(update);
			adTechProvidersSettled = true;
			markListPublished(generation);
			void recheckProviders();
			promptForChangedRestrictions(
				withdrawn,
				retainedCheck.restrictionsChanged
			);
			try {
				cmpApi ??= createCMPApi({
					cmpId,
					cmpVersion,
					gdprApplies: policyUsesIAB(kernel.getSnapshot()),
					getAddtlConsent: (tcString) => {
						const authority = kernel.getSnapshot().iab?.authority;
						return authority?.tcString === tcString
							? authority.addtlConsent
							: undefined;
					},
					gvl,
				});
				const current = kernel.getSnapshot();
				if (existingApi && current === beforeUpdate) {
					existingApi.updateConsent(
						readIAB(kernel).authority?.tcString ?? '',
						undefined,
						policyUsesIAB(current)
					);
				} else if (!existingApi && publishedTcString()) {
					cmpApi.updateConsent(
						publishedTcString(),
						undefined,
						policyUsesIAB(current)
					);
				}
				cmpApi.setDisplayStatus(cmpDisplayStatus(current));
				if (mayHydrate) {
					void restoreAuthority();
				}
			} catch {
			}
		} catch (error) {
			if (generation === listGeneration) {
				initializationError = error;
			}
		}
	};
	let initialization = initialize(preloadedGvl, reference);
	let notifyReplacement!: () => void;
	let replaced = new Promise<void>((resolve) => {
		notifyReplacement = resolve;
	});

	const whenReady = async (): Promise<void> => {
		if (
			initializationError &&
			!disposed &&
			!(initializationError instanceof PublisherRestrictionError)
		) {
			initialization = initialize(undefined, reference);
		}
		let pending: Promise<void>;
		do {
			pending = initialization;
			// oxlint-disable-next-line no-await-in-loop -- Each iteration follows a new initialization generation.
			await Promise.race([pending, replaced]);
		} while (pending !== initialization);
		if (initializationError instanceof PublisherRestrictionError) {
			throw initializationError;
		}
		if (initializationError) {
			throw new Error(
				`Unable to load IAB privacy settings: ${initializationError instanceof Error ? initializationError.message : 'vendor list request failed'}`,
				{ cause: initializationError }
			);
		}
		if (!disposed && preloadedGvl !== null && !cmpApi) {
			throw new Error('Unable to load IAB privacy settings.');
		}
	};

	const waitForReferencedList = async (): Promise<boolean> => {
		const before = kernel.getSnapshot();
		const records = kernel.getRecordsGeneration();
		const generation = confirmationGeneration;
		await whenReady();
		const current = kernel.getSnapshot();
		return (
			!disposed &&
			records === kernel.getRecordsGeneration() &&
			generation === confirmationGeneration &&
			current.resolution === before.resolution &&
			current.user === before.user &&
			current.subject === before.subject
		);
	};
	const queueBlanket = async (value: boolean): Promise<void> => {
		selectionRevision += 1;
		const revision = selectionRevision;
		try {
			if ((await waitForReferencedList()) && revision === selectionRevision) {
				const { gvl } = readIAB(kernel);
				if (gvl) {
					applyBlanket(kernel, gvl, value, restrictionsForBlanket(gvl));
				}
			}
		} catch {
		}
	};

	// oxlint-disable-next-line complexity -- Keep replacement, cancellation and allowlist handling in one lifecycle transition.
	const syncList = (previous: ConsentSnapshot, snapshot: ConsentSnapshot) => {
		if (options.gvl !== undefined) {
			return;
		}
		let inline = snapshot.iab?.gvl ?? undefined;
		const inlineChanged = inline && inline !== publishedList;
		const removed =
			previous.iab?.gvlReference && !snapshot.iab?.gvlReference && !inline;
		if (
			!(
				changedReference(previous.iab, snapshot.iab) ||
				inlineChanged ||
				removed
			)
		) {
			return;
		}
		reference = snapshot.iab?.gvlReference;
		if (reference?.summary && vendors?.length) {
			reference = { ...reference, summary: undefined };
			kernel.set.iab({ gvlReference: reference });
		}
		publishedList = inline ?? null;
		confirmationGeneration += 1;
		restoredFingerprint = null;
		const notify = notifyReplacement;
		replaced = new Promise<void>((resolve) => {
			notifyReplacement = resolve;
		});
		if (inline && vendors?.length) {
			inline = narrowGVLToVendors(inline, vendors);
		}
		if (removed) {
			listGeneration += 1;
			initializationError = undefined;
			cmpApi?.updateVendorList(null);
			initialization = Promise.resolve();
		} else {
			initialization = initialize(inline, reference);
		}
		notify();
	};

	const closeRestrictionPrompt = (): void => {
		openedForRestrictions = false;
		queueMicrotask(() => {
			if (!disposed && kernel.getSnapshot().activeUI === 'banner') {
				kernel.set.activeUI('none');
			}
		});
	};
	let previousDisplay = cmpDisplayStatus(kernel.getSnapshot());
	const publishToVendors = (snapshot: ConsentSnapshot): void => {
		if (!cmpApi) {
			return;
		}
		const published = publishedTcString();
		if (published === '' || published !== committingTcString) {
			cmpApi.updateConsent(published, undefined, policyUsesIAB(snapshot));
		}
		const nextDisplay = cmpDisplayStatus(snapshot);
		if (nextDisplay !== previousDisplay) {
			previousDisplay = nextDisplay;
			cmpApi.setDisplayStatus(nextDisplay);
		}
	};
	const syncStoredAuthority = (
		previous: KernelIABAuthority | null | undefined,
		held: KernelIABAuthority | null | undefined
	): void => {
		if (options.persistence !== false && held && held !== previous) {
			syncStoredAdditionalConsent(held.tcString, held.addtlConsent);
		}
	};
	const recheckChangedProviders = (
		previous: ConsentSnapshot,
		snapshot: ConsentSnapshot
	): void => {
		const held = snapshot.iab?.adTechProviders;
		if (held === previous.iab?.adTechProviders) {
			return;
		}
		if (
			clientAdTechProviders &&
			JSON.stringify(held ?? null) !== JSON.stringify(clientAdTechProviders)
		) {
			kernel.set.iab({ adTechProviders: clientAdTechProviders });
			return;
		}
		void recheckProviders();
	};
	let previousAuthority = kernel.getSnapshot().iab?.authority;
	let previousSnapshot = kernel.getSnapshot();
	let previousRecordsGeneration = kernel.getRecordsGeneration();
	const unsubscribe = kernel.subscribe((snapshot: ConsentSnapshot) => {
		const held = snapshot.iab?.authority;
		if (
			held &&
			snapshot.model === 'iab' &&
			grantsDeniedCategory(held, snapshot.explicitChoice)
		) {
			previousSnapshot = snapshot;
			withdrawAuthority(snapshot.explicitChoice);
			return;
		}
		const previous = previousSnapshot;
		previousSnapshot = snapshot;
		noteChoiceChange(previous, snapshot);
		queueMicrotask(() => {
			const recordsGeneration = kernel.getRecordsGeneration();
			if (recordsGeneration !== previousRecordsGeneration) {
				previousRecordsGeneration = recordsGeneration;
				void reloadAuthority();
			}
		});
		if (changedSelections(previous, snapshot)) {
			selectionRevision += 1;
		}
		syncList(previous, snapshot);
		recheckChangedProviders(previous, snapshot);

		const policyChanged = snapshot.resolution !== previous.resolution;
		if (!policyChanged && changedIABDraft(previous, snapshot)) {
			hydrationCancelled = true;
		}
		if (policyChanged) {
			queueMicrotask(() => {
				void restoreAuthority();
			});
		}
		if (previousAuthority && !snapshot.iab?.authority && !keepReceipt) {
			clearAuthorityReceipt();
			if (options.persistence !== false) {
				clearStoredTCString(previousAuthority.tcString);
			}
		}
		syncStoredAuthority(previousAuthority, snapshot.iab?.authority);
		previousAuthority = snapshot.iab?.authority;
		if (openedForRestrictions && snapshot.iab?.authority) {
			closeRestrictionPrompt();
		}
		armAuthorityTimer();
		publishToVendors(snapshot);
	});

	const buildTCFConsentData = function buildTCFConsentData() {
		const iab = readIAB(kernel);
		const customIds = new Set(
			iab.customVendors.map((vendor) => String(vendor.id))
		);
		const registeredChoices = (choices: Record<string, boolean>) =>
			Object.fromEntries(
				Object.entries(choices).filter(
					([id]) =>
						Object.hasOwn(iab.gvl?.vendors ?? {}, id) && !customIds.has(id)
				)
			);
		const introduced = iab.gvl
			? introducedLegitimateInterest(iab.gvl, publisherRestrictions)
			: { purposes: [], vendors: [] };
		const allowed = (ids: number[]) =>
			Object.fromEntries(ids.map((id) => [id, true]));
		const vendorConsents = registeredChoices(iab.vendorConsents);
		const vendorLegitimateInterests = registeredChoices({
			...allowed(introduced.vendors),
			...iab.vendorLegitimateInterests,
		});
		const disclosed: Record<string, boolean> = {};
		for (const id of Object.keys(vendorConsents)) {
			disclosed[id] = true;
		}
		for (const id of Object.keys(vendorLegitimateInterests)) {
			disclosed[id] = true;
		}
		return {
			publisherRestrictions: configuredRestrictions as
				| PublisherRestriction[]
				| undefined,
			purposeConsents: { ...iab.purposeConsents },
			purposeLegitimateInterests: {
				...allowed(introduced.purposes),
				...iab.purposeLegitimateInterests,
			},
			specialFeatureOptIns: { ...iab.specialFeatureOptIns },
			vendorConsents: { ...vendorConsents },
			vendorLegitimateInterests: { ...vendorLegitimateInterests },
			vendorsDisclosed: disclosed,
		};
	};

	const rejectInvalidRestrictions = (): void => {
		if (initializationError instanceof PublisherRestrictionError) {
			throw initializationError;
		}
	};

	const pendingAdTechProviders = (): Promise<void> | null =>
		adTechProviderIds.length > 0 &&
		!adTechProvidersSettled &&
		readIAB(kernel).gvl
			? initialization
			: null;
	const shownAdTechProviderIds = (): Set<string> =>
		new Set(
			(readIAB(kernel).adTechProviders ?? []).map(({ id }) => String(id))
		);
	const blanket = (gvl: GlobalVendorList, value: boolean): void => {
		applyBlanket(kernel, gvl, value, restrictionsForBlanket(gvl));
	};

	const generateTC = async function generateTC(): Promise<string> {
		if (!readIAB(kernel).gvl && reference && !(await waitForReferencedList())) {
			throw new Error('IAB action cancelled while loading vendor data.');
		}
		rejectInvalidRestrictions();
		const snapshot = kernel.getSnapshot();
		const recordsGeneration = kernel.getRecordsGeneration();
		const generation = confirmationGeneration;
		const iab = readIAB(kernel);
		if (!iab.gvl) {
			throw new Error(
				'createIAB: cannot generate TC string — GVL not loaded yet.'
			);
		}
		const consentData = buildTCFConsentData();
		await getTCFCore();
		const tcString = await generateTCString(consentData, iab.gvl, {
			cmpId,
			cmpVersion,
			isServiceSpecific,
			publisherCountryCode: options.publisherCountryCode ?? 'US',
		});
		if (
			!disposed &&
			generation === confirmationGeneration &&
			kernel.getRecordsGeneration() === recordsGeneration &&
			sameConfirmationContext(kernel.getSnapshot(), snapshot)
		) {
			kernel.set.iab({ tcString });
		}
		return tcString;
	};

	// oxlint-disable-next-line prefer-const -- Assigned after the handle closes over this teardown.
	let unregisterControls: (() => void) | undefined;
	const handle: IABHandle = {
		acceptAll() {
			if (!readIAB(kernel).gvl && reference) {
				void queueBlanket(true);
				return;
			}
			const { gvl } = readIAB(kernel);
			if (!gvl) {
				return;
			}
			blanket(gvl, true);
		},
		get cmpApi() {
			return cmpApi;
		},
		dispose() {
			disposed = true;
			clearTimeout(authorityTimer);
			unregisterControls?.();
			unsubscribe();
			unsubscribeClear();
			unsubscribeSaveStart();
			if (typeof window !== 'undefined') {
				window.removeEventListener('storage', onReceiptStored);
			}
			if (cmpApi) {
				try {
					cmpApi.destroy();
				} catch {
				}
				cmpApi = null;
			}
			if (typeof window !== 'undefined') {
				try {
					destroyStub();
				} catch {
				}
			}
		},
		generateTCString: generateTC,
		rejectAll() {
			if (!readIAB(kernel).gvl && reference) {
				void queueBlanket(false);
				return;
			}
			const { gvl } = readIAB(kernel);
			if (!gvl) {
				return;
			}
			blanket(gvl, false);
		},
		// oxlint-disable-next-line complexity -- Keep the async save cancellation checks together.
		async save() {
			if (
				!readIAB(kernel).gvl &&
				reference &&
				!(await waitForReferencedList())
			) {
				throw new Error('IAB action cancelled while loading vendor data.');
			}
			rejectInvalidRestrictions();
			const actionAt = Date.now();
			const providersLoading = pendingAdTechProviders();
			const shown = providersLoading ? shownAdTechProviderIds() : null;
			const visitorRevision = () => selectionRevision - ownSelectionRevisions;
			const revisionAtClick = visitorRevision();
			if (providersLoading) {
				await providersLoading;
			}
			if (disposed) {
				return;
			}
			if (visitorRevision() !== revisionAtClick) {
				throw new Error(
					'IAB action cancelled: selections changed while loading ad tech providers.'
				);
			}
			confirmationGeneration += 1;
			const generation = confirmationGeneration;
			const snapshot = kernel.getSnapshot();
			const recordsGeneration = kernel.getRecordsGeneration();
			if (!snapshot.iab?.gvl) {
				return;
			}
			const consentData = buildTCFConsentData();
			const receipt = createAuthorityReceipt(snapshot, '', actionAt);
			if (shown) {
				receipt.adTechProviderConsents = Object.fromEntries(
					Object.entries(receipt.adTechProviderConsents).filter(([id]) =>
						shown.has(id)
					)
				);
			}
			const tcString = await generateTCString(consentData, snapshot.iab.gvl, {
				cmpId,
				cmpVersion,
				confirmedAt: actionAt,
				isServiceSpecific,
				publisherCountryCode: options.publisherCountryCode ?? 'US',
			});
			const authority = await validateAuthority(
				{ ...receipt, tcString },
				snapshot,
				Date.now(),
				publisherRestrictions
			);
			if (
				!authority ||
				disposed ||
				generation !== confirmationGeneration ||
				kernel.getRecordsGeneration() !== recordsGeneration ||
				!sameConfirmationContext(kernel.getSnapshot(), snapshot)
			) {
				return;
			}
			const consents = iabPurposesToC15tConsents(
				consentData.purposeConsents,
				consentBasisPurposes(
					snapshot.iab.gvl,
					publisherRestrictions,
					snapshot.iab.customVendors,
					snapshot.iab.adTechProviders
				)
			);
			const scope = new Set<string>(snapshot.policyRule.scope);
			const consentPatch = Object.fromEntries(
				Object.entries(consents).filter(
					([category, granted]) => !granted || scope.has(category)
				)
			);
			committingTcString = tcString;
			let pendingSave: ReturnType<typeof kernel.commands.save>;
			try {
				pendingSave = kernel.commands.save(consentPatch, {
					actionAt,
					iabAuthority: authority,
				});
			} finally {
				committingTcString = null;
			}
			if (
				kernel.getSnapshot().iab?.authority?.tcString === tcString &&
				!disposed &&
				generation === confirmationGeneration &&
				kernel.getRecordsGeneration() === recordsGeneration
			) {
				if (options.persistence !== false) {
					storeAuthority(authority);
					cmpApi?.saveToStorage(tcString);
				}
				cmpApi?.updateConsent(
					tcString,
					consentData,
					policyUsesIAB(kernel.getSnapshot())
				);
				revisionAtAuthority = selectionRevision;
				armAuthorityTimer();
			} else if (cmpApi && !disposed) {
				cmpApi.updateConsent(
					publishedTcString(),
					undefined,
					policyUsesIAB(kernel.getSnapshot())
				);
			}
			const result = await pendingSave;
			if (!result.ok) {
				throw new Error('Unable to save IAB preferences.');
			}
		},
		setAdTechProviderConsent(id, value) {
			const key = String(id);
			const current = readIAB(kernel).adTechProviderConsents ?? {};
			if (current[key] === value) {
				return;
			}
			kernel.set.iab({
				adTechProviderConsents: { ...current, [key]: value },
			});
		},
		setPurposeConsent(id, value) {
			const current = readIAB(kernel).purposeConsents;
			if (current[id] === value) {
				return;
			}
			const next = { ...current, [id]: value };
			kernel.set.iab({ purposeConsents: next });
		},
		setPurposeLegitimateInterest(id, value) {
			const current = readIAB(kernel).purposeLegitimateInterests;
			if (current[id] === value) {
				return;
			}
			kernel.set.iab({
				purposeLegitimateInterests: { ...current, [id]: value },
			});
		},
		setSpecialFeatureOptIn(id, value) {
			const current = readIAB(kernel).specialFeatureOptIns;
			if (current[id] === value) {
				return;
			}
			kernel.set.iab({
				specialFeatureOptIns: { ...current, [id]: value },
			});
		},
		setVendorConsent(id, value) {
			const key = String(id);
			const current = readIAB(kernel).vendorConsents;
			if (current[key] === value) {
				return;
			}
			kernel.set.iab({
				vendorConsents: { ...current, [key]: value },
			});
		},
		setVendorLegitimateInterest(id, value) {
			const key = String(id);
			const current = readIAB(kernel).vendorLegitimateInterests;
			if (current[key] === value) {
				return;
			}
			kernel.set.iab({
				vendorLegitimateInterests: { ...current, [key]: value },
			});
		},
		whenReady,
	};
	unregisterControls = registerIABControls(kernel, handle);
	return handle;
};

export type { CMPApi, GlobalVendorList, NonIABVendor } from '@c15t/core';
export {
	type HeadlessIABBannerAction,
	type HeadlessIABBannerState,
	type HeadlessIABDialogAction,
	type HeadlessIABDialogData,
	type HeadlessIABDialogState,
	type HeadlessIABPreferenceTab,
	type HeadlessIABProcessedFeature,
	type HeadlessIABProcessedPurpose,
	type HeadlessIABProcessedSpecialFeature,
	type HeadlessIABProcessedStack,
	type HeadlessIABProcessedVendor,
	type HeadlessIABStateInput,
	type HeadlessIABVendorId,
	type ProcessedFeature,
	type ProcessedGVLData,
	type ProcessedPurpose,
	type ProcessedSpecialFeature,
	type ProcessedStack,
	type ProcessedVendor,
	processGVLForDialog,
	resolveIABBannerSummary,
} from './headless';
export {
	c15tConsentsToIabPurposes,
	clearGVLCache,
	fetchGVL,
	iabPurposesToC15tConsents,
};
