import type { CMPApi, CMPApiConfig, GlobalVendorList } from '@c15t/core';

import { forEachSequential } from '../for-each-sequential';
import { CMP_VERSION_NUMBER } from './cmp-defaults';
import { assertValidCmpId } from './cmp-id';
import { IAB_STORAGE_KEYS } from './constants';
import type {
	CMPStatus,
	DisplayStatus,
	EventStatus,
	PingData,
	TCData,
	TCDataOutsideTCF,
	TCFApiCallback,
	TCFConsentData,
} from './iab-tcf-types';
import { toTCDataRestrictions } from './publisher-restrictions';
import { clearStubQueue, getStubQueue } from './stub';
import { decodeTCString, getDisclosedVendorIds } from './tc-string';

const setCookie = function setCookie(
	name: string,
	value: string,
	maxAgeDays: number
): void {
	if (typeof document === 'undefined') {
		return;
	}

	const maxAge = maxAgeDays * 24 * 60 * 60;
	document.cookie = `${name}=${encodeURIComponent(value)}; max-age=${maxAge}; path=/; SameSite=Lax`;
};

const getCookie = function getCookie(name: string): string | null {
	if (typeof document === 'undefined') {
		return null;
	}

	const match = document.cookie.match(new RegExp(`(^| )${name}=([^;]+)`, 'u'));
	if (match?.[2]) {
		return decodeURIComponent(match[2]);
	}
	return null;
};

export const clearStoredTCString = function clearStoredTCString(
	tcString: string
): void {
	try {
		if (
			typeof document !== 'undefined' &&
			getCookie(IAB_STORAGE_KEYS.TC_STRING_COOKIE) === tcString
		) {
			document.cookie = `${IAB_STORAGE_KEYS.TC_STRING_COOKIE}=; max-age=0; path=/; SameSite=Lax`;
			document.cookie = `${IAB_STORAGE_KEYS.AC_STRING_COOKIE}=; max-age=0; path=/; SameSite=Lax`;
		}
	} catch {
	}
	try {
		if (localStorage.getItem(IAB_STORAGE_KEYS.TC_STRING_LOCAL) === tcString) {
			localStorage.removeItem(IAB_STORAGE_KEYS.TC_STRING_LOCAL);
			localStorage.removeItem(IAB_STORAGE_KEYS.AC_STRING_LOCAL);
		}
	} catch {
	}
};

export const syncStoredAdditionalConsent = function syncStoredAdditionalConsent(
	tcString: string,
	addtlConsent: string | undefined
): void {
	try {
		if (
			typeof document !== 'undefined' &&
			getCookie(IAB_STORAGE_KEYS.TC_STRING_COOKIE) === tcString &&
			(getCookie(IAB_STORAGE_KEYS.AC_STRING_COOKIE) ?? undefined) !==
				addtlConsent
		) {
			setCookie(
				IAB_STORAGE_KEYS.AC_STRING_COOKIE,
				addtlConsent ?? '',
				addtlConsent ? 395 : 0
			);
		}
	} catch {
	}
	try {
		if (
			localStorage.getItem(IAB_STORAGE_KEYS.TC_STRING_LOCAL) === tcString &&
			(localStorage.getItem(IAB_STORAGE_KEYS.AC_STRING_LOCAL) ?? undefined) !==
				addtlConsent
		) {
			if (addtlConsent) {
				localStorage.setItem(IAB_STORAGE_KEYS.AC_STRING_LOCAL, addtlConsent);
			} else {
				localStorage.removeItem(IAB_STORAGE_KEYS.AC_STRING_LOCAL);
			}
		}
	} catch {
	}
};

const copyConsentData = function copyConsentData(
	consentData: TCFConsentData
): TCFConsentData {
	return {
		...consentData,
		publisherRestrictions: consentData.publisherRestrictions?.map(
			(restriction) => ({
				...restriction,
				vendorIds: [...restriction.vendorIds],
			})
		),
		purposeConsents: { ...consentData.purposeConsents },
		purposeLegitimateInterests: { ...consentData.purposeLegitimateInterests },
		specialFeatureOptIns: { ...consentData.specialFeatureOptIns },
		vendorConsents: { ...consentData.vendorConsents },
		vendorLegitimateInterests: { ...consentData.vendorLegitimateInterests },
		vendorsDisclosed: { ...consentData.vendorsDisclosed },
	};
};

export const createCMPApi = function createCMPApi(
	config: CMPApiConfig
): CMPApi {
	const cmpId = assertValidCmpId(config.cmpId);
	const cmpVersion = config.cmpVersion ?? CMP_VERSION_NUMBER;
	let { gvl } = config;
	let tcfApplies = config.gdprApplies ?? true;

	let tcString = '';
	let addtlConsent: string | undefined;
	const addtlConsentFor = (string: string): string | undefined =>
		string ? config.getAddtlConsent?.(string) : undefined;
	let cmpStatus: CMPStatus = 'loading';
	let displayStatus: DisplayStatus = 'hidden';
	const eventListeners = new Map<
		number,
		TCFApiCallback<TCData | TCDataOutsideTCF>
	>();
	let nextListenerId = 0;

	let cachedTCData: TCData | null = null;
	let stateRevision = 0;
	let currentConsentData: TCFConsentData | null = null;
	const cmpVersionNumber =
		typeof cmpVersion === 'number'
			? cmpVersion
			: Number.parseInt(String(cmpVersion), 10) || 1;
	const composeTCData = async function composeTCData(
		string: string,
		consentData: TCFConsentData | null,
		additional: string | undefined,
		eventStatus?: EventStatus,
		listenerId?: number
	): Promise<TCData> {
		let purposeConsents: Record<number, boolean> =
			consentData?.purposeConsents ?? {};
		let purposeLegitInterests: Record<number, boolean> =
			consentData?.purposeLegitimateInterests ?? {};
		let vendorConsents: Record<number, boolean> = Object.fromEntries(
			Object.entries(consentData?.vendorConsents ?? {}).map(([id, value]) => [
				Number(id),
				value,
			])
		);
		let vendorLegitInterests: Record<number, boolean> = Object.fromEntries(
			Object.entries(consentData?.vendorLegitimateInterests ?? {}).map(
				([id, value]) => [Number(id), value]
			)
		);
		let specialFeatureOptins: Record<number, boolean> =
			consentData?.specialFeatureOptIns ?? {};
		let disclosedVendorIds = getDisclosedVendorIds(
			consentData?.vendorsDisclosed ?? {}
		);
		let restrictions: Record<number, Record<number, number>> = {};

		if (string) {
			try {
				const decoded = await decodeTCString(string);
				restrictions = toTCDataRestrictions(decoded.publisherRestrictions);
				if (!consentData) {
					// oxlint-disable-next-line prefer-destructuring -- Preserve declaration order, interface shape, and public compatibility.
					purposeConsents = decoded.purposeConsents;
					purposeLegitInterests = decoded.purposeLegitimateInterests;
					// oxlint-disable-next-line prefer-destructuring -- Preserve declaration order, interface shape, and public compatibility.
					vendorConsents = decoded.vendorConsents;
					vendorLegitInterests = decoded.vendorLegitimateInterests;
					specialFeatureOptins = decoded.specialFeatureOptIns;
					disclosedVendorIds = getDisclosedVendorIds(decoded.vendorsDisclosed);
				}
			} catch {
			}
		}

		const tcData: TCData = {
			cmpId,
			cmpStatus,
			cmpVersion: cmpVersionNumber,
			eventStatus,
			gdprApplies: true,
			isServiceSpecific: true,
			listenerId,
			publisher: {
				consents: {},
				customPurpose: {
					consents: {},
					legitimateInterests: {},
				},
				legitimateInterests: {},
				restrictions,
			},
			publisherCC: 'US',
			purpose: {
				consents: purposeConsents,
				legitimateInterests: purposeLegitInterests,
			},
			purposeOneTreatment: false,
			specialFeatureOptins,
			tcString: string,
			tcfPolicyVersion: gvl.tcfPolicyVersion,
			useNonStandardTexts: false,
			vendor: {
				consents: vendorConsents,
				disclosedVendors: Object.fromEntries(
					disclosedVendorIds.map((vendorId) => [vendorId, true])
				),
				legitimateInterests: vendorLegitInterests,
			},
		};
		if (string && additional) {
			tcData.addtlConsent = additional;
		}

		return tcData;
	};

	const buildTCData = async function buildTCData(
		eventStatus?: EventStatus,
		listenerId?: number
	): Promise<TCData | TCDataOutsideTCF> {
		if (!tcfApplies) {
			const outside: TCDataOutsideTCF = {
				cmpId,
				cmpStatus,
				cmpVersion: cmpVersionNumber,
				gdprApplies: false,
				tcfPolicyVersion: gvl.tcfPolicyVersion,
			};
			if (eventStatus) {
				outside.eventStatus = eventStatus;
			}
			if (listenerId !== undefined) {
				outside.listenerId = listenerId;
			}
			return outside;
		}
		if (
			cachedTCData &&
			cachedTCData.tcString === tcString &&
			cachedTCData.addtlConsent === addtlConsent &&
			!eventStatus
		) {
			return { ...structuredClone(cachedTCData), listenerId };
		}
		const string = tcString;
		const consentData = currentConsentData;
		const additional = addtlConsent;
		const tcData = await composeTCData(
			string,
			consentData,
			additional,
			eventStatus,
			listenerId
		);
		if (
			!tcfApplies ||
			tcString !== string ||
			currentConsentData !== consentData ||
			addtlConsent !== additional
		) {
			return buildTCData(eventStatus, listenerId);
		}

		if (!eventStatus) {
			cachedTCData = structuredClone(tcData);
		}

		return tcData;
	};

	const sendCurrentTCData = async function sendCurrentTCData(
		handler: TCFApiCallback<TCData | TCDataOutsideTCF>,
		eventStatus: () => EventStatus | undefined,
		listenerId?: number
	): Promise<void> {
		const revision = stateRevision;
		const tcData = await buildTCData(eventStatus(), listenerId);
		if (revision !== stateRevision) {
			return sendCurrentTCData(handler, eventStatus, listenerId);
		}
		handler(tcData, true);
	};

	const handlePing = function handlePing(
		handler: TCFApiCallback<PingData>
	): void {
		const pingData: PingData = {
			apiVersion: '2.3',
			cmpId,
			cmpLoaded: cmpStatus === 'loaded',
			cmpStatus,
			cmpVersion:
				typeof cmpVersion === 'string' ? cmpVersion : String(cmpVersion),
			displayStatus,
			gdprApplies: tcfApplies,
			gvlVersion: gvl.vendorListVersion,
			tcfPolicyVersion: gvl.tcfPolicyVersion,
		};

		handler(pingData, true);
	};

	const handleGetTCData = async function handleGetTCData(
		handler: TCFApiCallback<TCData | TCDataOutsideTCF>,
		_vendorIds?: number[]
	): Promise<void> {
		await sendCurrentTCData(handler, () => undefined);
	};

	const handleGetInAppTCData = function handleGetInAppTCData(
		handler: TCFApiCallback<TCData | TCDataOutsideTCF>
	): Promise<void> {
		return handleGetTCData(handler);
	};

	const handleGetVendorList = function handleGetVendorList(
		handler: TCFApiCallback<GlobalVendorList>,
		_vendorListVersion?: number
	): void {
		handler(cmpStatus === 'loaded' ? gvl : null, cmpStatus === 'loaded');
	};

	const hasSignal = (): boolean => tcString !== '' || !tcfApplies;

	const currentStatus = (): EventStatus | undefined => {
		if (cmpStatus !== 'loaded') {
			return undefined;
		}
		if (displayStatus === 'visible') {
			return 'cmpuishown';
		}
		return hasSignal() ? 'tcloaded' : undefined;
	};

	const handleAddEventListener = async function handleAddEventListener(
		handler: TCFApiCallback<TCData | TCDataOutsideTCF>
	): Promise<void> {
		nextListenerId += 1;
		const listenerId = nextListenerId;
		eventListeners.set(listenerId, handler);

		await sendCurrentTCData(handler, currentStatus, listenerId);
	};

	const handleRemoveEventListener = function handleRemoveEventListener(
		handler: TCFApiCallback<boolean>,
		listenerId: number
	): void {
		const existed = eventListeners.has(listenerId);
		eventListeners.delete(listenerId);
		handler(existed, true);
	};

	const notifyEventListeners = async function notifyEventListeners(
		eventStatus: EventStatus | undefined
	): Promise<void> {
		await forEachSequential(eventListeners, {
			run: ([listenerId, listener]) =>
				sendCurrentTCData(listener, () => eventStatus, listenerId),
		});
	};

	const initializeAPI = function initializeAPI(): void {
		if (typeof window === 'undefined') {
			return;
		}

		const queuedCalls = getStubQueue();

		window.__tcfapi = ((
			command: string,
			version: number,
			handler: TCFApiCallback<unknown>,
			parameter?: unknown
		) => {
			switch (command) {
				case 'ping':
					handlePing(handler as TCFApiCallback<PingData>);
					break;
				case 'getTCData':
					handleGetTCData(
						handler as TCFApiCallback<TCData | TCDataOutsideTCF>,
						parameter as number[] | undefined
					);
					break;
				case 'getInAppTCData':
					handleGetInAppTCData(
						handler as TCFApiCallback<TCData | TCDataOutsideTCF>
					);
					break;
				case 'getVendorList':
					handleGetVendorList(
						handler as TCFApiCallback<GlobalVendorList>,
						parameter as number | undefined
					);
					break;
				case 'addEventListener':
					handleAddEventListener(
						handler as TCFApiCallback<TCData | TCDataOutsideTCF>
					);
					break;
				case 'removeEventListener':
					handleRemoveEventListener(
						handler as TCFApiCallback<boolean>,
						parameter as number
					);
					break;
				default:
					return handler(null, false);
			}
		}) as typeof window.__tcfapi;

		clearStubQueue();

		cmpStatus = 'loaded';

		for (const args of queuedCalls) {
			window.__tcfapi?.(...args);
		}
	};

	initializeAPI();

	return {
		destroy: () => {
			eventListeners.clear();
			cachedTCData = null;

			if (typeof window !== 'undefined') {
				delete (window as { __tcfapi?: unknown }).__tcfapi;
			}
		},

		getTcString: () => tcString,

		loadFromStorage: (): string | null => {
			const cookieValue = getCookie(IAB_STORAGE_KEYS.TC_STRING_COOKIE);
			if (cookieValue) {
				tcString = cookieValue;
				addtlConsent = addtlConsentFor(cookieValue);
				cachedTCData = null;
				stateRevision += 1;
				notifyEventListeners('tcloaded');
				return cookieValue;
			}

			if (typeof localStorage !== 'undefined') {
				try {
					const localValue = localStorage.getItem(
						IAB_STORAGE_KEYS.TC_STRING_LOCAL
					);
					if (localValue) {
						tcString = localValue;
						addtlConsent = addtlConsentFor(localValue);
						cachedTCData = null;
						stateRevision += 1;
						notifyEventListeners('tcloaded');
						return localValue;
					}
				} catch {
				}
			}

			return null;
		},

		saveToStorage: (newTcString: string) => {
			const additional = addtlConsentFor(newTcString);
			setCookie(IAB_STORAGE_KEYS.TC_STRING_COOKIE, newTcString, 395);
			if (additional) {
				setCookie(IAB_STORAGE_KEYS.AC_STRING_COOKIE, additional, 395);
			} else {
				setCookie(IAB_STORAGE_KEYS.AC_STRING_COOKIE, '', 0);
			}

			if (typeof localStorage !== 'undefined') {
				try {
					localStorage.setItem(IAB_STORAGE_KEYS.TC_STRING_LOCAL, newTcString);
					if (additional) {
						localStorage.setItem(IAB_STORAGE_KEYS.AC_STRING_LOCAL, additional);
					} else {
						localStorage.removeItem(IAB_STORAGE_KEYS.AC_STRING_LOCAL);
					}
				} catch {
				}
			}
		},

		setDisplayStatus: (status: DisplayStatus) => {
			displayStatus = status;
			if (status === 'visible') {
				notifyEventListeners('cmpuishown');
			}
		},

		updateConsent: (
			newTcString: string,
			consentData?: TCFConsentData,
			applies?: boolean
		) => {
			const additional = addtlConsentFor(newTcString);
			const changed =
				newTcString !== tcString ||
				additional !== addtlConsent ||
				(applies !== undefined && applies !== tcfApplies);
			tcfApplies = applies ?? tcfApplies;
			tcString = newTcString;
			addtlConsent = additional;
			currentConsentData =
				newTcString && consentData ? copyConsentData(consentData) : null;
			cachedTCData = null;
			stateRevision += 1;
			if (cmpStatus !== 'loaded') {
				return;
			}
			if (consentData) {
				notifyEventListeners('useractioncomplete');
				return;
			}
			if (!changed) {
				return;
			}
			notifyEventListeners(hasSignal() ? currentStatus() : undefined);
		},

		updateVendorList: (nextGvl) => {
			if (nextGvl) {
				gvl = nextGvl;
			}
			cmpStatus = nextGvl ? 'loaded' : 'loading';
			tcString = '';
			addtlConsent = undefined;
			currentConsentData = null;
			cachedTCData = null;
			stateRevision += 1;
		},
	};
};
