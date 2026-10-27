import { compareCanonical } from '@c15t/schema/types';

import { displayedCategories as listDisplayed } from '../consent/consent-types';
import type { AllConsentNames } from '../consent/consent-types';
import { listedVendors } from '../libs/vendors';
import { deniedVendorIds } from '../modules/has';
import type {
	ConsentKernel,
	ConsentSnapshot,
	ConsentState,
	SaveResult,
	SaveUISource,
	Unsubscribe,
} from '../types';

type Grants = Record<string, boolean>;

export interface PreferenceDraftState {
	readonly values: Readonly<ConsentState>;
	readonly displayedCategories: readonly AllConsentNames[];
	readonly vendors: Readonly<Grants>;
	readonly isDirty: boolean;
	readonly isStale: boolean;
}

export interface PreferenceDraftSaveOptions {
	input?: 'all' | 'none';
	categories?: readonly AllConsentNames[];
	uiSource?: SaveUISource;
}

export type PreferenceDraftSaveInput = Partial<ConsentState> & {
	vendors?: Grants;
};

export interface PreferenceDraft {
	readonly kernel: ConsentKernel;
	getState: () => PreferenceDraftState;
	subscribe: (listener: () => void) => Unsubscribe;
	set: (category: AllConsentNames, value: boolean) => void;
	update: (patch: Partial<ConsentState>) => void;
	setVendor: (vendorId: string, granted: boolean) => void;
	acceptAll: () => void;
	rejectAll: () => void;
	reset: () => void;
	setDefaults: (defaults: Partial<ConsentState> | undefined) => void;
	toSaveInput: (
		categories?: readonly AllConsentNames[]
	) => PreferenceDraftSaveInput | null;
	save: (options?: PreferenceDraftSaveOptions) => Promise<SaveResult>;
}

export interface PreferenceDraftOptions {
	defaults?: Partial<ConsentState>;
}

const setOwn = function setOwn(
	target: Grants,
	key: string,
	value: boolean
): void {
	Object.defineProperty(target, key, {
		configurable: true,
		enumerable: true,
		value,
		writable: true,
	});
};

const keep = function keep<Value>(previous: Value, next: Value): Value {
	return JSON.stringify(previous) === JSON.stringify(next) ? previous : next;
};

const vendorSurface = function vendorSurface(
	snapshot: ConsentSnapshot
): string {
	if (snapshot.model === 'iab') {
		return '';
	}
	return JSON.stringify(
		listedVendors(snapshot.vendors?.declared ?? [], deniedVendorIds(snapshot))
			.map((vendor) => [vendor.id, vendor.disabled === true, vendor.category])
			.sort(([left], [right]) => compareCanonical(String(left), String(right)))
	);
};

const recordedValues = function recordedValues(
	snapshot: ConsentSnapshot,
	scope: readonly AllConsentNames[],
	defaults: Partial<ConsentState> | undefined
): ConsentState {
	const rule = snapshot.policyRule;
	const recorded = snapshot.explicitChoice?.categories;
	const values: ConsentState = {
		experience: false,
		functionality: false,
		marketing: false,
		measurement: false,
		necessary: true,
	};
	for (const category of scope) {
		if (category !== 'necessary') {
			values[category] =
				recorded?.[category]?.value ??
				defaults?.[category] ??
				(rule.model === 'opt-out' ||
					rule.preselectedCategories.includes(category));
		}
	}
	return values;
};

const recordedVendors = function recordedVendors(
	snapshot: ConsentSnapshot
): [Grants, Set<string>] {
	const grants: Grants = {};
	const toggleable = new Set<string>();
	if (snapshot.model !== 'iab') {
		const denied = deniedVendorIds(snapshot);
		for (const vendor of snapshot.vendors?.declared ?? []) {
			setOwn(grants, vendor.id, !denied?.has(vendor.id));
			if (vendor.disabled !== true) {
				toggleable.add(vendor.id);
			}
		}
	}
	return [grants, toggleable];
};

const overlay = function overlay<KeyType extends string>(
	base: Readonly<Record<KeyType, boolean>>,
	staged: ReadonlyMap<KeyType, boolean>,
	include: (key: KeyType) => boolean
): Record<KeyType, boolean> {
	const next = { ...base };
	for (const [key, value] of staged) {
		if (include(key)) {
			setOwn(next as Grants, key, value);
		}
	}
	return next;
};

const prune = function prune<KeyType extends string>(
	staged: Map<KeyType, boolean>,
	recorded: Readonly<Record<string, boolean>>
): void {
	for (const [key, value] of staged) {
		if (recorded[key] === value) {
			staged.delete(key);
		}
	}
};

// oxlint-disable-next-line max-lines-per-function -- One closure keeps the staged edits private.
export const createPreferenceDraft = function createPreferenceDraft(
	kernel: ConsentKernel,
	options: PreferenceDraftOptions = {}
): PreferenceDraft {
	let { defaults } = options;
	let shownDefaults = defaults;
	const staged = new Map<AllConsentNames, boolean>();
	const stagedVendors = new Map<string, boolean>();
	let seen = '';
	let derivedFrom: ConsentSnapshot | null = null;
	let baseline = {} as ConsentState;
	let seeded: Grants = {};
	let toggleable: ReadonlySet<string> = new Set();
	const listeners = new Set<() => void>();
	let stopFollowing: Unsubscribe | null = null;

	const derive = function derive(
		previous: PreferenceDraftState | null
	): PreferenceDraftState {
		const snapshot = kernel.getSnapshot();
		derivedFrom = snapshot;
		const scope =
			snapshot.evaluationPolicy.choiceScope ?? snapshot.policyRule.scope;
		const displayedCategories = listDisplayed(scope);
		const isClean = () => staged.size === 0 && stagedVendors.size === 0;
		if (isClean()) {
			shownDefaults = defaults;
		}
		baseline = recordedValues(snapshot, scope, shownDefaults);
		[seeded, toggleable] = recordedVendors(snapshot);
		prune(staged, baseline);
		prune(stagedVendors, seeded);
		if (isClean() && shownDefaults !== defaults) {
			shownDefaults = defaults;
			baseline = recordedValues(snapshot, scope, shownDefaults);
		}
		const isDirty = !isClean();
		const review = [
			snapshot.evaluationPolicy.choice.fingerprint,
			displayedCategories.join(','),
			vendorSurface(snapshot),
		].join('|');
		if (!isDirty) {
			seen = review;
		}
		const values = overlay(baseline, staged, (category) =>
			displayedCategories.includes(category)
		);
		const vendors = overlay(seeded, stagedVendors, (id) => toggleable.has(id));
		const isStale = isDirty && seen !== review;
		if (!previous) {
			return { displayedCategories, isDirty, isStale, values, vendors };
		}
		return keep(previous, {
			displayedCategories: keep(
				previous.displayedCategories,
				displayedCategories
			),
			isDirty,
			isStale,
			values: keep(previous.values, values),
			vendors: keep(previous.vendors, vendors),
		});
	};

	let state = derive(null);

	const refresh = function refresh(): PreferenceDraftState {
		const next = derive(state);
		if (next !== state) {
			state = next;
			for (const listener of [...listeners]) {
				listener();
			}
		}
		return state;
	};

	const current = function current(): PreferenceDraftState {
		return derivedFrom === kernel.getSnapshot() ? state : refresh();
	};

	const stage = function stage<KeyType>(
		target: Map<KeyType, boolean>,
		key: KeyType,
		value: boolean,
		recorded: boolean | undefined
	): boolean {
		if (value === recorded) {
			return target.delete(key);
		}
		if (target.get(key) === value) {
			return false;
		}
		target.set(key, value);
		return true;
	};

	const changed = function changed(any: boolean): void {
		if (any) {
			refresh();
		}
	};

	const update = function update(patch: Partial<ConsentState>): void {
		const { displayedCategories } = current();
		let any = false;
		for (const category of displayedCategories) {
			const value = patch[category];
			if (category !== 'necessary' && typeof value === 'boolean') {
				any = stage(staged, category, value, baseline[category]) || any;
			}
		}
		changed(any);
	};

	const updateVendors = function updateVendors(patch: Readonly<Grants>): void {
		current();
		let any = false;
		for (const [id, granted] of Object.entries(patch)) {
			if (toggleable.has(id) && typeof granted === 'boolean') {
				any = stage(stagedVendors, id, granted, seeded[id]) || any;
			}
		}
		changed(any);
	};

	const stageAll = function stageAll(value: boolean): void {
		const { displayedCategories } = current();
		update(
			Object.fromEntries(
				displayedCategories.map((category) => [category, value])
			)
		);
		const grants: Grants = {};
		for (const id of toggleable) {
			setOwn(grants, id, true);
		}
		updateVendors(grants);
	};

	const reset = function reset(): void {
		staged.clear();
		stagedVendors.clear();
		refresh();
	};

	const toSaveInput = function toSaveInput(
		categories?: readonly AllConsentNames[]
	): PreferenceDraftSaveInput | null {
		const { displayedCategories, isStale, values } = current();
		if (isStale) {
			return null;
		}
		const input: PreferenceDraftSaveInput = {};
		for (const category of displayedCategories) {
			if (
				category !== 'necessary' &&
				(categories === undefined || categories.includes(category))
			) {
				input[category] = values[category];
			}
		}
		const moved: Grants = {};
		for (const [id, granted] of stagedVendors) {
			if (toggleable.has(id)) {
				setOwn(moved, id, granted);
			}
		}
		if (Object.keys(moved).length > 0) {
			input.vendors = moved;
		}
		return input;
	};

	return {
		acceptAll() {
			stageAll(true);
		},
		getState: current,
		kernel,
		rejectAll() {
			stageAll(false);
		},
		reset,
		save(saveOptions = {}) {
			const { categories, input, uiSource } = saveOptions;
			const context = { categories, uiSource };
			if (input === 'all' || input === 'none') {
				const pending = kernel.commands.save(input, context);
				reset();
				return pending;
			}
			const draftInput = toSaveInput(categories);
			if (!draftInput) {
				return Promise.resolve({ ok: false });
			}
			const pending = kernel.commands.save(draftInput, context);
			refresh();
			return pending;
		},
		set(category, value) {
			update({ [category]: value });
		},
		setDefaults(next) {
			defaults = next;
			refresh();
		},
		setVendor(vendorId, granted) {
			updateVendors({ [vendorId]: granted });
		},
		subscribe(listener) {
			current();
			listeners.add(listener);
			stopFollowing ??= kernel.subscribe(() => {
				refresh();
			});
			return () => {
				listeners.delete(listener);
				if (listeners.size === 0 && stopFollowing) {
					stopFollowing();
					stopFollowing = null;
				}
			};
		},
		toSaveInput,
		update,
	};
};
