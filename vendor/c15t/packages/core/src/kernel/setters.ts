import type { AllConsentNames } from '../consent/consent-types';
import type { ExperimentAssignment, ExperimentGate } from '../libs/experiment';
import {
	mergeDeclaredVendors,
	sameDeclaredVendors,
	withoutSourceVendors,
} from '../libs/vendors';
import type {
	ConsentState,
	KernelActiveUI,
	KernelConfig,
	KernelIABState,
	KernelOverrides,
	KernelVendorsState,
	ResolvedVendor,
	VendorSource,
} from '../types';
import { normalizeExternalPermissions } from './external-permissions';
import type { KernelRuntime } from './runtime';
import { copyIABAuthority, DEFAULT_IAB, DEFAULT_VENDORS } from './snapshot';

const mergeIab = function mergeIab(
	current: KernelIABState | null,
	input: Partial<KernelIABState>
): { next: KernelIABState; changed: boolean } {
	const baseline = current ?? DEFAULT_IAB;
	const next: KernelIABState = { ...baseline, ...input };
	if (input.authority !== undefined && input.authority !== baseline.authority) {
		next.authority = copyIABAuthority(input.authority);
	}
	let changed = false;
	for (const key of Object.keys(next) as (keyof KernelIABState)[]) {
		if (next[key] !== baseline[key]) {
			changed = true;
			break;
		}
	}
	if (!current && input) {
		changed = true;
	}
	return { changed, next };
};

const copyDeclaredVendor = function copyDeclaredVendor(
	vendor: ResolvedVendor
): ResolvedVendor {
	const copy: ResolvedVendor = {
		...vendor,
		category: structuredClone(vendor.category),
	};
	if (vendor.ownerCategory !== undefined) {
		copy.ownerCategory = structuredClone(vendor.ownerCategory);
	}
	if (vendor.ownerDetails !== undefined) {
		copy.ownerDetails = { ...vendor.ownerDetails };
	}
	if (vendor.shadowed) {
		copy.shadowed = copyDeclaredVendor(vendor.shadowed);
	}
	return copy;
};

const mergeVendors = function mergeVendors(
	current: KernelVendorsState | null,
	input: Partial<KernelVendorsState>,
	options: { replaceSource?: VendorSource } = {}
): { next: KernelVendorsState | null; changed: boolean } {
	const baseline = current ?? DEFAULT_VENDORS;
	const base =
		options.replaceSource === undefined || input.declared === undefined
			? baseline.declared
			: withoutSourceVendors(baseline.declared, options.replaceSource);
	const merged =
		input.declared === undefined
			? baseline.declared
			: mergeDeclaredVendors(base, input.declared.map(copyDeclaredVendor));
	const declared =
		merged !== baseline.declared &&
		sameDeclaredVendors(merged, baseline.declared)
			? baseline.declared
			: merged;
	const listVersion =
		input.listVersion === undefined ? baseline.listVersion : input.listVersion;
	const next: KernelVendorsState | null =
		declared.length === 0 && listVersion === null
			? null
			: { declared, listVersion };
	const changed =
		(current === null) !== (next === null) ||
		(next !== null &&
			current !== null &&
			(next.listVersion !== current.listVersion ||
				next.declared !== current.declared));
	return { changed, next };
};

export const buildSetters = function buildSetters(
	runtime: KernelRuntime,
	config: KernelConfig
) {
	const { getSnapshot, commit, announce } = runtime;

	let configured = config.consentCategories
		? [...config.consentCategories]
		: [];
	let inferred = config.inferredConsentCategories?.length
		? new Set(config.inferredConsentCategories)
		: null;
	const updateCategories = () => {
		const categories = [
			...new Set([...configured, ...(inferred ?? [])]),
		].sort();
		const next = categories.length ? categories : null;
		const current = getSnapshot().consentCategories;
		if (
			next === current ||
			(next?.length === current?.length &&
				next?.every((category, index) => category === current?.[index]))
		) {
			return;
		}
		commit({
			activeUI: getSnapshot().activeUI === 'dialog' ? 'dialog' : undefined,
			consentCategories: next,
			now: runtime.now(),
		});
	};

	return {
		activeUI(ui: KernelActiveUI): void {
			if (getSnapshot().externalPermissions) {
				if (ui === 'dialog') {
					runtime.emit({ type: 'preferences:requested' });
				}
				return;
			}
			commit({ activeUI: ui, now: runtime.now() });
		},
		consentCategories(
			categories: readonly AllConsentNames[] | undefined
		): void {
			configured = categories ? [...categories] : [];
			updateCategories();
		},
		experiment(
			assignment: ExperimentAssignment | null,
			gate?: ExperimentGate
		): void {
			runtime.setExperiment(assignment, gate ?? null);
		},
		externalPermissions(permissions: Partial<ConsentState>): void {
			if (config.initialExternalPermissions === undefined) {
				throw new Error(
					'Configure external consent authority before updating its permissions.'
				);
			}
			commit({
				externalPermissions: normalizeExternalPermissions(permissions),
			});
		},
		iab(input: Partial<KernelIABState>): void {
			const { next, changed } = mergeIab(getSnapshot().iab, input);
			if (!changed) {
				return;
			}
			announce({ iab: next }, 'iab:set');
		},
		language(code: string): void {
			const snapshot = getSnapshot();
			if (snapshot.overrides.language === code) {
				return;
			}
			announce(
				{ overrides: { ...snapshot.overrides, language: code } },
				'overrides:set',
				true
			);
		},
		overrides(input: KernelOverrides): void {
			announce(
				{
					now: runtime.now(),
					overrides: { ...getSnapshot().overrides, ...input },
				},
				'overrides:set',
				true
			);
		},
		privacySignals(input: { gpc?: boolean }): void {
			if (input.gpc === undefined) {
				return;
			}
			commit({ now: runtime.now(), privacyDetected: input.gpc === true });
		},
		registerConsentCategories(categories: readonly AllConsentNames[]): void {
			if (!categories.length) {
				return;
			}
			inferred ??= new Set();
			const previousSize = inferred.size;
			for (const category of categories) {
				inferred.add(category);
			}
			if (inferred.size !== previousSize) {
				updateCategories();
			}
		},
		vendors(
			input: Partial<KernelVendorsState>,
			options?: { replaceSource?: VendorSource }
		): void {
			const { next, changed } = mergeVendors(
				getSnapshot().vendors,
				input,
				options
			);
			if (!changed) {
				return;
			}
			announce({ vendors: next }, 'vendors:set');
		},
	};
};
