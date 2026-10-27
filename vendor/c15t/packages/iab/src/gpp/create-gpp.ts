import type {
	AllConsentNames,
	ConsentKernel,
	ConsentSnapshot,
} from '@c15t/core';
import type { ConsentRuntimeGPPFactoryOptions } from '@c15t/core/runtime';

import { isValidCmpId, MAX_CMP_ID } from '../tcf/cmp-id';
import { createGPPCmpApi } from './cmp-api';
import type { GPPSectionState, GPPState } from './cmp-api';
import { encodeUSSection } from './encoder';
import {
	GPC_SUBSECTION_TYPE,
	TCF_EU_PREFIX,
	TCF_EU_SECTION_ID,
	US_NATIONAL_SECTION,
	US_SECTIONS,
} from './sections';
import { destroyGPPStub, initializeGPPStub } from './stub';
import { parseTCFEUSection } from './tcf-section';
import type { GPPParsedSubsection, GPPPingData } from './types';
import {
	resolveUSSectionDefinition,
	resolveUSSectionValues,
} from './us-section';
import type { GPPMspaMode, GPPUSApproach, GPPUSFallback } from './us-section';

const UNREGISTERED_CMP_ID = 1;

export interface CreateGPPOptions extends ConsentRuntimeGPPFactoryOptions {
	kernel: ConsentKernel;
	cmpId?: number;
	usApproach?: GPPUSApproach;
	usFallback?: GPPUSFallback;
	mspaMode?: GPPMspaMode;
	optOutCategories?: readonly AllConsentNames[];
	tcf?: boolean;
}

export interface GPPHandle {
	getGPPString: () => string;
	getPingData: () => GPPPingData;
	dispose: () => void;
}

export interface GPPRuntimeDependencies {
	parseTCFEUSection: (tcString: string) => Promise<GPPParsedSubsection[]>;
}

const assertGPPCmpId = function assertGPPCmpId(value: number): number {
	if (value !== UNREGISTERED_CMP_ID && !isValidCmpId(value)) {
		throw new Error(
			`@c15t/iab/gpp: cmpId must be 1 (no registered CMP ID) or a registered CMP ID up to ${MAX_CMP_ID}. Received: ${String(value)}.`
		);
	}
	return value;
};

const isPromptVisible = (snapshot: ConsentSnapshot): boolean =>
	snapshot.activeUI === 'banner' || snapshot.activeUI === 'dialog';

const heldTCString = (snapshot: ConsentSnapshot): string =>
	snapshot.iab?.authority?.tcString ?? '';

export const createGPPRuntime = function createGPPRuntime(
	options: CreateGPPOptions,
	dependencies: GPPRuntimeDependencies
): GPPHandle {
	const {
		kernel,
		mspaMode,
		optOutCategories = ['marketing'],
		tcf = true,
		usApproach = 'state',
		usFallback = 'usnat',
	} = options;
	const configuredCmpId =
		options.cmpId === undefined ? undefined : assertGPPCmpId(options.cmpId);
	const usSections = US_SECTIONS.filter((section) =>
		section === US_NATIONAL_SECTION
			? usApproach === 'national' || usFallback === 'usnat'
			: usApproach === 'state'
	);
	const supportedAPIs = [
		...(tcf ? [`${TCF_EU_SECTION_ID}:${TCF_EU_PREFIX}`] : []),
		...usSections.map((section) => `${section.id}:${section.prefix}`),
	];

	const resolveCmpId = (snapshot: ConsentSnapshot): number => {
		if (configuredCmpId !== undefined) {
			return configuredCmpId;
		}
		const fromKernel = snapshot.iab?.cmpId;
		return isValidCmpId(fromKernel) ? fromKernel : UNREGISTERED_CMP_ID;
	};

	let disposed = false;
	let decoded: { tcString: string; parsed: GPPSectionState['parsed'] } | null =
		null;
	const decoding = new Set<string>();

	const decodeTCString = async (
		tcString: string,
		onDecoded: () => void
	): Promise<void> => {
		if (decoding.has(tcString)) {
			return;
		}
		decoding.add(tcString);
		let parsed: GPPSectionState['parsed'] = null;
		try {
			parsed = await dependencies.parseTCFEUSection(tcString);
		} catch {
		}
		decoding.delete(tcString);
		if (disposed || heldTCString(kernel.getSnapshot()) !== tcString) {
			return;
		}
		decoded = { parsed, tcString };
		onDecoded();
	};

	const resolveSections = (
		snapshot: ConsentSnapshot,
		onDecoded: () => void
	): Pick<GPPState, 'applicableSections' | 'sections'> | null => {
		if (tcf && snapshot.model === 'iab') {
			const tcString = heldTCString(snapshot);
			if (!tcString) {
				return { applicableSections: [TCF_EU_SECTION_ID], sections: [] };
			}
			if (decoded?.tcString !== tcString) {
				void decodeTCString(tcString, onDecoded);
				return null;
			}
			return {
				applicableSections: [TCF_EU_SECTION_ID],
				sections: [
					{
						encoded: tcString,
						id: TCF_EU_SECTION_ID,
						parsed: decoded.parsed,
						prefix: TCF_EU_PREFIX,
					},
				],
			};
		}
		const definition = resolveUSSectionDefinition(
			snapshot,
			usApproach,
			usFallback
		);
		if (!definition) {
			return { applicableSections: [-1], sections: [] };
		}
		const values = resolveUSSectionValues(definition, snapshot, {
			mspaMode,
			optOutCategories,
		});
		return {
			applicableSections: [definition.id],
			sections: [
				{
					encoded: encodeUSSection(definition, values),
					id: definition.id,
					parsed: definition.gpc
						? [
								values.core,
								{ Gpc: values.gpc, SubsectionType: GPC_SUBSECTION_TYPE },
							]
						: [values.core],
					prefix: definition.prefix,
				},
			],
		};
	};

	const waitingForTCF = (snapshot: ConsentSnapshot): boolean =>
		tcf &&
		snapshot.model === 'iab' &&
		(!snapshot.iab?.gvl || !heldTCString(snapshot));

	const initialSnapshot = kernel.getSnapshot();
	if (typeof window !== 'undefined' && typeof document !== 'undefined') {
		initializeGPPStub();
	}
	let published: GPPState = {
		applicableSections: [0],
		cmpDisplayStatus: isPromptVisible(initialSnapshot) ? 'visible' : 'hidden',
		cmpId: resolveCmpId(initialSnapshot),
		sections: [],
		signalStatus: 'not ready',
	};
	const api = createGPPCmpApi({ initial: published, supportedAPIs });

	const sync = (): void => {
		if (disposed) {
			return;
		}
		const snapshot = kernel.getSnapshot();
		const visible = isPromptVisible(snapshot);
		const resolved = snapshot.policyPending
			? null
			: resolveSections(snapshot, sync);
		published = {
			...published,
			...resolved,
			cmpDisplayStatus: visible ? 'visible' : 'hidden',
			cmpId: resolveCmpId(snapshot),
			signalStatus:
				resolved && !visible && !waitingForTCF(snapshot)
					? 'ready'
					: 'not ready',
		};
		api.publish(published);
	};

	sync();
	const unsubscribe = kernel.subscribe(sync);

	return {
		dispose: () => {
			if (disposed) {
				return;
			}
			disposed = true;
			unsubscribe();
			const owner = api.isInstalled();
			api.destroy();
			if (owner) {
				destroyGPPStub();
			}
		},
		getGPPString: () => api.getPingData().gppString,
		getPingData: api.getPingData,
	};
};

export const createGPP = function createGPP(
	options: CreateGPPOptions
): GPPHandle {
	return createGPPRuntime(options, { parseTCFEUSection });
};
