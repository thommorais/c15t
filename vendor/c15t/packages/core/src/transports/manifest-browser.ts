import type {
	ConsentManifest,
	ResolveInitFromManifestInputs,
} from '@c15t/schema/types';

import { createUnreportedJourneys } from '../libs/journey';
import type {
	ManifestModeBaseOptions,
	ManifestModeInputs,
	ManifestModeSourceOptions,
} from '../modes';
import type { InitContext, KernelOverrides, KernelTransport } from '../types';
import { earlyInitModes } from './early-init-modes';
import type { EarlyInitMode } from './early-init-modes';
import { createHostedTransport } from './hosted';
import type { TransportInitResponse } from './init-output';
import {
	hasLocationMatchers,
	mayBeLocationFree,
} from './manifest-browser-packs';
import type * as RemoteModule from './manifest-browser-remote';
import type * as ResolveModule from './manifest-browser-resolve';
import type {
	ProviderTransportContext,
	ProviderTransportFactory,
} from './mode';

export type BrowserManifestOptions = ManifestModeBaseOptions &
	ManifestModeSourceOptions & {
		backendURL?: string;
		fetch?: typeof globalThis.fetch;
		headers?: Record<string, string>;
		credentials?: RequestCredentials;
		domain?: string;
		initFallback?: boolean;
	};

export type BrowserManifestModeFactory = ProviderTransportFactory &
	Readonly<BrowserManifestOptions> & {
		readonly kind: 'manifest';
		readonly type: 'manifest';
	};

export type { OtherLanguage } from './manifest-browser-resolve';

const trimSlash = function trimSlash(url: string): string {
	return url.endsWith('/') ? url.slice(0, -1) : url;
};

const deriveBackendURL = function deriveBackendURL(
	options: BrowserManifestOptions
): string | undefined {
	if (options.backendURL !== undefined) {
		return trimSlash(options.backendURL);
	}
	if (!options.manifestURL) {
		return undefined;
	}
	const withoutQuery =
		options.manifestURL.split(/[?#]/u)[0] ?? options.manifestURL;
	const trimmed = trimSlash(withoutQuery);
	if (!trimmed.endsWith('/manifest')) {
		return undefined;
	}
	try {
		const parsed = new URL(trimmed, 'https://c15t.invalid');
		if (
			!['http:', 'https:'].includes(parsed.protocol) ||
			!parsed.pathname.endsWith('/manifest')
		) {
			return undefined;
		}
	} catch {
		return undefined;
	}
	return trimmed.slice(0, -'/manifest'.length);
};

const lacksLocation = function lacksLocation(
	resolved: ConsentManifest,
	inputs: ResolveInitFromManifestInputs
): boolean {
	if (!hasLocationMatchers(resolved)) {
		return false;
	}
	const country = inputs.country?.toUpperCase();
	if (!country) {
		return true;
	}
	if (inputs.region) {
		return false;
	}
	return (resolved.policyPacks ?? []).some((pack) =>
		pack.match.regions?.some(
			(region) => region.country.toUpperCase() === country
		)
	);
};

const gppOnPage = (): boolean =>
	typeof window !== 'undefined' &&
	typeof (window as Window & { __gpp?: unknown }).__gpp === 'function';

const asksInit = function asksInit(
	resolved: ConsentManifest,
	inputs: ResolveInitFromManifestInputs,
	options: Pick<BrowserManifestOptions, 'geoURL' | 'initFallback'>,
	gpp: boolean
): boolean | undefined {
	if (!lacksLocation(resolved, inputs) || options.initFallback === false) {
		return false;
	}
	if (options.geoURL) {
		return undefined;
	}
	return (
		gpp ||
		resolved.iab?.enabled === true ||
		!mayBeLocationFree(resolved) ||
		undefined
	);
};

const readGlobalPrivacyControl = function readGlobalPrivacyControl():
	| boolean
	| undefined {
	if (typeof navigator === 'undefined') {
		return undefined;
	}
	try {
		const value = (navigator as Navigator & { globalPrivacyControl?: unknown })
			.globalPrivacyControl;
		return typeof value === 'boolean' ? value : undefined;
	} catch {
		return undefined;
	}
};

const mergeInputs = function mergeInputs(
	base: ManifestModeInputs | undefined,
	geo: ManifestModeInputs | undefined,
	overrides: Readonly<KernelOverrides>
): ResolveInitFromManifestInputs {
	const language =
		overrides.language ??
		(typeof navigator === 'undefined' ? 'en' : navigator.language);
	return {
		country: overrides.country ?? base?.country ?? geo?.country ?? null,
		gpc: overrides.gpc ?? readGlobalPrivacyControl(),
		language,
		region: overrides.region ?? base?.region ?? geo?.region ?? null,
	};
};

interface ManifestSource {
	backendURL: string;
	getFetch: () => typeof globalThis.fetch;
	loadGeo: (geoURL: string) => Promise<ManifestModeInputs | undefined>;
	loadManifest: () => Promise<ConsentManifest>;
	loadResolver: () => Promise<typeof ResolveModule>;
}

const createManifestSource = function createManifestSource(
	options: BrowserManifestOptions
): ManifestSource {
	const backendURL = deriveBackendURL(options);
	const manifestURL =
		options.manifestURL ??
		(options.snapshot || backendURL === undefined
			? undefined
			: `${backendURL}/manifest`);
	if (!(options.snapshot || manifestURL)) {
		throw new Error(
			'c15t: manifest() needs `snapshot`, `manifestURL` or `backendURL`.'
		);
	}
	if (backendURL === undefined) {
		throw new Error(
			'c15t: manifest() needs `backendURL` unless `manifestURL` ends in `/manifest`. Pass the consent API URL, or an empty string for this origin.'
		);
	}
	const getFetch = (): typeof globalThis.fetch =>
		options.fetch ?? globalThis.fetch.bind(globalThis);
	let cachedManifest: Promise<ConsentManifest> | undefined;
	let cachedGeo: Promise<ManifestModeInputs | undefined> | undefined;

	let remote: Promise<typeof RemoteModule> | undefined;
	const loadRemote = () => {
		remote ??= import('./manifest-browser-remote');
		return remote;
	};
	const preload = async (load: () => Promise<unknown>) => {
		try {
			await load();
		} catch {
		}
	};
	if (!options.snapshot) {
		preload(loadRemote);
	}
	let resolver: Promise<typeof ResolveModule> | undefined;
	const loadResolver = async () => {
		resolver ??= import('./manifest-browser-resolve');
		try {
			return await resolver;
		} catch (error) {
			resolver = undefined;
			throw error;
		}
	};
	const { snapshot } = options;
	if (
		!snapshot ||
		!hasLocationMatchers(snapshot) ||
		mayBeLocationFree(snapshot) ||
		options.inputs?.country ||
		options.geoURL
	) {
		preload(loadResolver);
	}

	return {
		backendURL,
		getFetch,
		loadGeo(geoURL) {
			cachedGeo ??= (async () => {
				try {
					const remoteModule = await loadRemote();
					return await remoteModule.fetchGeoInputs(geoURL, getFetch());
				} catch {
					return undefined;
				}
			})();
			return cachedGeo;
		},
		async loadManifest() {
			if (snapshot) {
				return snapshot;
			}
			cachedManifest ??= (async () => {
				const remoteModule = await loadRemote();
				return remoteModule.fetchManifest(manifestURL as string, getFetch(), {
					credentials: options.credentials,
					headers: options.headers,
				});
			})();
			try {
				return await cachedManifest;
			} catch (error) {
				cachedManifest = undefined;
				remote = undefined;
				throw error;
			}
		},
		loadResolver,
	};
};

const transportFrom = function transportFrom(
	options: BrowserManifestOptions,
	source: ManifestSource,
	context: Pick<ProviderTransportContext, 'gppEnabled'> | undefined
): KernelTransport {
	const hosted = createHostedTransport({
		backendURL: source.backendURL,
		domain: options.domain,
		fetch: options.fetch,
		headers: options.headers,
	});
	const unreported = createUnreportedJourneys();
	const gpp = () => context?.gppEnabled === true || gppOnPage();
	const ask = (ctx: InitContext): Promise<TransportInitResponse> => {
		unreported.reported(ctx.journey);
		return hosted.init(ctx);
	};
	const answer = async (
		resolved: ConsentManifest,
		inputs: ResolveInitFromManifestInputs,
		ctx: InitContext
	): Promise<TransportInitResponse> => {
		unreported.resolvedLocally(ctx.journey);
		const { resolveLocally } = await source.loadResolver();
		return resolveLocally(resolved, inputs, source.getFetch());
	};
	const initFrom = async (
		resolved: ConsentManifest,
		ctx: InitContext
	): Promise<TransportInitResponse> => {
		let inputs = mergeInputs(options.inputs, undefined, ctx.overrides);
		const asks = asksInit(resolved, inputs, options, gpp());
		if (asks !== undefined) {
			return asks ? ask(ctx) : answer(resolved, inputs, ctx);
		}
		if (
			!resolved.iab?.enabled &&
			mayBeLocationFree(resolved) &&
			(await source.loadResolver()).isLocationFree(resolved) &&
			!gpp()
		) {
			return answer(resolved, inputs, ctx);
		}
		if (options.geoURL) {
			inputs = mergeInputs(
				options.inputs,
				await source.loadGeo(options.geoURL),
				ctx.overrides
			);
			if (!lacksLocation(resolved, inputs)) {
				return answer(resolved, inputs, ctx);
			}
		}
		return ask(ctx);
	};
	return {
		identify: hosted.identify,
		init(ctx: InitContext): Promise<TransportInitResponse> {
			const { snapshot } = options;
			if (
				snapshot &&
				asksInit(
					snapshot,
					mergeInputs(options.inputs, undefined, ctx.overrides),
					options,
					gpp()
				)
			) {
				return ask(ctx);
			}
			return source.loadManifest().then((resolved) => initFrom(resolved, ctx));
		},
		loadSubjectRecord: hosted.loadSubjectRecord,
		save: (payload) => hosted.save(unreported.strip(payload)),
	};
};

export const createBrowserManifestTransport =
	function createBrowserManifestTransport(
		options: BrowserManifestOptions,
		context?: Pick<ProviderTransportContext, 'gppEnabled'>
	): KernelTransport {
		return transportFrom(options, createManifestSource(options), context);
	};

export const manifest = function manifest(
	options: BrowserManifestOptions
): BrowserManifestModeFactory {
	const settings = { ...options } as BrowserManifestOptions;
	const source = createManifestSource(settings);
	return Object.assign(
		(context?: ProviderTransportContext) =>
			transportFrom(settings, source, context),
		settings,
		{
			kind: 'manifest' as const,
			type: 'manifest' as const,
		}
	);
};

const earlySettings = new WeakMap<EarlyInitMode, BrowserManifestOptions>();

const manifestText = new WeakMap<ConsentManifest, string>();

const sameManifest = function sameManifest(
	a: ConsentManifest | undefined,
	b: ConsentManifest | undefined
): boolean {
	if (a === b) {
		return true;
	}
	if (!a || !b || a.revision !== b.revision) {
		return false;
	}
	const text = (value: ConsentManifest) => {
		let json = manifestText.get(value);
		if (json === undefined) {
			json = JSON.stringify(value);
			manifestText.set(value, json);
		}
		return json;
	};
	return text(a) === text(b);
};

export const withEarlyInit = function withEarlyInit(
	mode: BrowserManifestModeFactory
): BrowserManifestModeFactory {
	const settings: BrowserManifestOptions = {
		...mode,
		inputs: mode.inputs && { ...mode.inputs },
	} as BrowserManifestOptions;
	const early: EarlyInitMode = {
		requestsInit: (overrides) =>
			settings.snapshot !== undefined &&
			asksInit(
				settings.snapshot,
				mergeInputs(settings.inputs, undefined, overrides),
				settings,
				gppOnPage()
			) === true,
		sameAs: (other) => {
			const theirs = earlySettings.get(other);
			const plain = ({
				snapshot: _snapshot,
				...rest
			}: BrowserManifestOptions) => JSON.stringify(rest);
			return (
				theirs !== undefined &&
				theirs.fetch === settings.fetch &&
				sameManifest(theirs.snapshot, settings.snapshot) &&
				plain(theirs) === plain(settings)
			);
		},
	};
	earlySettings.set(early, settings);
	earlyInitModes.set(mode, early);
	return mode;
};
