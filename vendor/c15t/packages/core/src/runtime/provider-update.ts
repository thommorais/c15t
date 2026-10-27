import type { extractConsentNamesFromCondition } from '../libs/has';
import type { declareOwnedVendors, resolveVendors } from '../libs/vendors';
import type {
	ClearOnRevocationHandle,
	ClearOnRevocationOptions,
} from '../modules/clear-on-revocation/types';
import type {
	IframeBlockerHandle,
	IframeBlockerOptions,
} from '../modules/iframe-blocker/types';
import type {
	holdNetworkRequests,
	NetworkHold,
} from '../modules/network-blocker/hold';
import type {
	NetworkBlockerHandle,
	NetworkBlockerOptions,
} from '../modules/network-blocker/types';
import type {
	ScriptLoaderHandle,
	ScriptLoaderOptions,
} from '../modules/script-loader/types';
import type { KernelUser } from '../types';
import type { afterModuleLoaded } from './lazy-module';
import type { ModuleSlot } from './provider-runtime';
import type { normalizeKernelUser } from './runtime-kernel';
import type {
	ConsentProviderRuntimeOptions,
	ConsentRuntime,
	ConsentRuntimeUpdate,
} from './types';

export interface BuiltProviderRuntime {
	runtime: ConsentRuntime;
	scripts: ModuleSlot<ScriptLoaderOptions, ScriptLoaderHandle>;
	network: ModuleSlot<NetworkBlockerOptions, NetworkBlockerHandle>;
	iframes: ModuleSlot<IframeBlockerOptions, IframeBlockerHandle>;
	cleanup: ModuleSlot<ClearOnRevocationOptions, ClearOnRevocationHandle>;
	track: (dispose: () => void) => void;
}

export interface ProviderUpdateTools {
	afterModuleLoaded: typeof afterModuleLoaded;
	declareOwnedVendors: typeof declareOwnedVendors;
	extractConsentNamesFromCondition: typeof extractConsentNamesFromCondition;
	holdNetworkRequests: typeof holdNetworkRequests;
	normalizeKernelUser: typeof normalizeKernelUser;
	notHeld: NetworkHold;
	resolveVendors: typeof resolveVendors;
}

export interface ProviderUpdateHost {
	active: () => BuiltProviderRuntime;
	readonly enabled: boolean;
	initial: ConsentProviderRuntimeOptions;
	main: BuiltProviderRuntime;
	ownerSource: symbol;
	tools: ProviderUpdateTools;
}

declare const process: { env: { NODE_ENV?: string } };

const isProductionBuild = function isProductionBuild(): boolean {
	try {
		return process.env.NODE_ENV === 'production';
	} catch {
		return false;
	}
};

const warnInDevelopment = function warnInDevelopment(message: string): void {
	if (!isProductionBuild()) {
		console.warn(message);
	}
};

const isPromiseLike = function isPromiseLike<Value>(
	value: Value | PromiseLike<Value> | undefined
): value is PromiseLike<Value> {
	return typeof (value as PromiseLike<Value> | undefined)?.then === 'function';
};

const ownersOf = function ownersOf(options: ConsentRuntimeUpdate) {
	return [
		...(options.scripts ?? []),
		...(options.networkBlocker ? (options.networkBlocker.rules ?? []) : []),
	];
};

const userKey = function userKey(user: KernelUser | undefined): string {
	return JSON.stringify(
		user && [
			user.externalId,
			user.externalIdType,
			user.identityProvider,
			user.identityToken,
			user.properties,
		]
	);
};

const vendorsKey = function vendorsKey(options: ConsentRuntimeUpdate): string {
	return JSON.stringify([
		options.vendors ?? [],
		ownersOf(options).map((owner) => [owner.vendor ?? null, owner.category]),
	]);
};

const initialOnlyKey = function initialOnlyKey(
	options: ConsentRuntimeUpdate
): string {
	const { persistence, prefetch } = options;
	return JSON.stringify([
		options.mode?.kind,
		options.i18n,
		(isPromiseLike(prefetch) ? undefined : prefetch)?.experiment ??
			options.experiment,
		options.storageConfig,
		typeof persistence === 'object'
			? [persistence.skipHydration, persistence.storageConfig, persistence.sync]
			: persistence !== false,
	]);
};

const replace = function replace<
	Options,
	Handle extends { dispose: () => void },
>(
	target: BuiltProviderRuntime,
	slot: ModuleSlot<Options, Handle>,
	changes: Partial<NoInfer<Options>> | null,
	initialOptions: () => NoInfer<Options>
): void {
	const mountedByRuntime = slot.last !== null && slot.inner !== null;
	slot.inner?.dispose();
	slot.inner = null;
	if (!changes) {
		return;
	}
	const options = { ...(slot.last ?? initialOptions()), ...changes };
	slot.last = options;
	slot.inner = slot.factory(options);
	if (!mountedByRuntime) {
		target.track(slot.standIn.dispose);
	}
};

const redeclareVendors = function redeclareVendors(
	host: ProviderUpdateHost,
	current: ConsentRuntimeUpdate
): void {
	const {
		declareOwnedVendors,
		extractConsentNamesFromCondition,
		resolveVendors,
	} = host.tools;
	const { kernel } = host.main.runtime;
	const owners = ownersOf(current);
	const declared = resolveVendors({
		config: current.vendors,
		existing: (kernel.getSnapshot().vendors?.declared ?? []).flatMap(
			(vendor) => {
				const manifest =
					vendor.source === 'manifest' ? vendor : vendor.shadowed;
				if (manifest?.source !== 'manifest') {
					return [];
				}
				const {
					ownerCategory: _stale,
					ownerDetails: _staleDetails,
					...rest
				} = manifest;
				return [rest];
			}
		),
		onWarn: warnInDevelopment,
	});
	kernel.set.vendors({ declared }, { replaceSource: 'config' });
	declareOwnedVendors(kernel, owners, host.ownerSource);
	kernel.set.registerConsentCategories(
		[...declared, ...owners].flatMap((declaration) =>
			extractConsentNamesFromCondition(declaration.category)
		)
	);
};

// oxlint-disable-next-line complexity -- One comparison per live module option.
const syncModules = function syncModules(
	host: ProviderUpdateHost,
	previous: ConsentRuntimeUpdate,
	current: ConsentRuntimeUpdate
): void {
	const { afterModuleLoaded, holdNetworkRequests, notHeld } = host.tools;
	const target = host.active();
	const { enabled } = host;
	const { kernel } = target.runtime;
	if (current.scripts !== previous.scripts) {
		const loader: ScriptLoaderHandle | null = target.scripts.inner;
		if (loader) {
			loader.updateScripts(current.scripts ?? []);
		} else if (current.scripts?.length) {
			replace(target, target.scripts, { scripts: current.scripts }, () => ({
				kernel,
				nonce: current.nonce,
				onDebug: current.scriptLoader?.onDebug,
				scripts: [],
			}));
			afterModuleLoaded(target.scripts.inner, () => {
				if (target.cleanup.inner) {
					replace(target, target.cleanup, {}, () => ({
						config: host.initial.clearOnRevocation ?? {},
						kernel,
					}));
				}
			});
		}
	}
	if (!enabled) {
		return;
	}
	const before = previous.networkBlocker || undefined;
	const after = current.networkBlocker || undefined;
	const blocker: NetworkBlockerHandle | null = target.network.inner;
	const noRules = () => ({ hold: notHeld, kernel, rules: [] });
	if (after && blocker) {
		const on = after.enabled !== false;
		const wasOn = before?.enabled !== false;
		if (on !== wasOn) {
			blocker.setEnabled(on);
		}
		if (after.rules !== before?.rules || (on && !wasOn)) {
			const hold = on ? holdNetworkRequests(after.rules) : notHeld;
			blocker.updateRules(after.rules, hold);
			afterModuleLoaded(blocker, hold.fail);
			target.track(() => hold.block());
		}
	} else if (after) {
		const hold =
			after.enabled === false ? notHeld : holdNetworkRequests(after.rules);
		replace(target, target.network, { ...after, hold }, noRules);
		afterModuleLoaded(target.network.inner, hold.fail);
		target.track(() => hold.block());
	} else if (blocker) {
		replace(target, target.network, null, noRules);
	}
	const iframeOn = current.iframeBlocker !== false;
	if (
		iframeOn !== Boolean(target.iframes.inner) ||
		(current.iframeBlocker || undefined)?.disableAutomaticBlocking !==
			(previous.iframeBlocker || undefined)?.disableAutomaticBlocking
	) {
		replace(
			target,
			target.iframes,
			iframeOn
				? {
						disableAutomaticBlocking: (current.iframeBlocker || undefined)
							?.disableAutomaticBlocking,
					}
				: null,
			() => ({ kernel })
		);
	}
};

export const applyProviderUpdate = function applyProviderUpdate(
	host: ProviderUpdateHost,
	previous: ConsentRuntimeUpdate,
	current: ConsentRuntimeUpdate,
	withModules: boolean
): void {
	const { tools } = host;
	const { normalizeKernelUser } = tools;
	if (
		!isProductionBuild() &&
		initialOnlyKey(current) !== initialOnlyKey(previous)
	) {
		console.warn(
			'c15t: `mode`, `i18n`, `experiment`, `persistence` and `storageConfig` are read once. Create a new runtime (remount the provider) to change them.'
		);
	}
	const user = normalizeKernelUser(current.user);
	if (userKey(user) !== userKey(normalizeKernelUser(previous.user))) {
		void host.main.runtime.identify(user);
	}
	if (vendorsKey(current) !== vendorsKey(previous)) {
		redeclareVendors(host, current);
	}
	if (withModules) {
		syncModules(host, previous, current);
	}
};
