import type { Script } from './libs/script-loader/types';
import { evaluateConsent, getEffectiveGateState } from './modules/has';
import type { ConsentRuntime } from './runtime/types';
import type { ConsentSnapshot } from './types';

export type EventProperties = Record<string, string | number | boolean>;
export interface EventDispatcherOptions {
	scripts: readonly Script[];
	getSnapshot: () => ConsentSnapshot;
	pageviews?: readonly string[];
	globals?: object;
}

interface PageviewState {
	initialPath?: string;
	vendorPaths: Map<string, string>;
}

interface DispatcherInputs extends Omit<EventDispatcherOptions, 'scripts'> {
	getScripts: () => readonly Script[];
	pageviewState: PageviewState;
}

const dispatcher = (options: DispatcherInputs) => {
	const globals =
		options.globals ?? (typeof window === 'undefined' ? {} : window);
	const call = (path: string | readonly string[], args: unknown[]) => {
		let owner: unknown = globals;
		const keys = typeof path === 'string' ? path.split('.') : [...path];
		const method = keys.pop();
		for (const key of keys) {
			if (
				!owner ||
				(typeof owner !== 'object' && typeof owner !== 'function')
			) {
				return;
			}
			// oxlint-disable-next-line anti-slop/no-reflect-get -- Vendor SDK paths are resolved dynamically and every receiver/method is checked.
			owner = Reflect.get(owner, key);
		}
		if (
			!owner ||
			!method ||
			(typeof owner !== 'object' && typeof owner !== 'function')
		) {
			return;
		}
		// oxlint-disable-next-line anti-slop/no-reflect-get -- The method is checked before calling it with its original SDK receiver.
		const fn: unknown = Reflect.get(owner, method);
		if (typeof fn === 'function') {
			// oxlint-disable-next-line anti-slop/no-reflect-apply -- Preserve the original vendor SDK receiver after checking the function.
			Reflect.apply(fn, owner, args);
		}
	};
	const permitted = () => {
		const snapshot = options.getSnapshot();
		if (!getEffectiveGateState(snapshot).effectivePermissions.measurement) {
			return [];
		}
		return options
			.getScripts()
			.filter((script) => evaluateConsent(script, snapshot));
	};
	return {
		pageview(path: string) {
			const [next = ''] = path.split('#');
			const { pageviewState } = options;
			if (pageviewState.initialPath === undefined) {
				pageviewState.initialPath = next;
				return;
			}
			const changed = new Set<string>();
			for (const vendor of options.pageviews ?? []) {
				const previous =
					pageviewState.vendorPaths.get(vendor) ?? pageviewState.initialPath;
				if (previous !== next) {
					changed.add(vendor);
				}
				pageviewState.vendorPaths.set(vendor, next);
			}
			for (const script of permitted()) {
				const vendor = script.vendor ?? script.id;
				if (!vendor || !changed.delete(vendor)) {
					continue;
				}
				try {
					if (vendor === 'posthog') {
						call('posthog.capture', ['$pageview']);
					}
					if (vendor === 'segment') {
						call('analytics.page', []);
					}
					if (vendor === 'hightouch') {
						call('htevents.page', []);
					}
				} catch {
				}
			}
		},
		// oxlint-disable-next-line complexity -- One explicit branch for each supported vendor event API.
		track(event: string, properties: EventProperties = {}) {
			const sent = new Set<string>();
			for (const script of permitted()) {
				const vendor = script.vendor ?? script.id;
				if (!vendor || sent.has(vendor)) {
					continue;
				}
				sent.add(vendor);
				const props = { ...properties };
				try {
					switch (vendor) {
						case 'google-tag-manager':
							call(
								[script.attributes?.['data-c15t-layer'] ?? 'dataLayer', 'push'],
								[{ ...props, event }]
							);
							break;
						case 'gtag':
							call('gtag', ['event', event, props]);
							break;
						case 'posthog':
							call('posthog.capture', [event, props]);
							break;
						case 'mixpanel':
						case 'mixpanel-analytics':
							call('mixpanel.track', [event, props]);
							break;
						case 'segment':
							call('analytics.track', [event, props]);
							break;
						case 'hightouch':
							call('htevents.track', [event, props]);
							break;
						case 'heap':
							call('heap.track', [event, props]);
							break;
						case 'amplitude':
							call('amplitude.track', [event, props]);
							break;
						case 'logrocket':
							call('LogRocket.track', [event, props]);
							break;
						case 'adobe-analytics':
							call('_satellite.track', [event, props]);
							break;
						case 'databuddy':
							call('databuddy.track', [event, props]);
							break;
						case 'plausible-analytics':
							call('plausible', [event, { props }]);
							break;
						case 'fathom-analytics':
							call('fathom.trackEvent', [event]);
							break;
						case 'pirsch':
							call('pirsch', [event, { meta: props }]);
							break;
						case 'microsoft-clarity':
							call('clarity', ['event', event]);
							break;
						case 'hotjar':
							call('hj', ['event', event]);
							break;
						case 'vercel-analytics':
							call('va', ['event', { data: props, name: event }]);
							break;
						case 'one-dollar-stats':
							call('stonks.event', [
								event,
								Object.fromEntries(
									Object.entries(props).map(([key, value]) => [
										key,
										String(value),
									])
								),
							]);
							break;
						case 'umami':
						case 'umami-analytics':
							call('umami.track', [event, props]);
							break;
						case 'rybbit':
						case 'rybbit-analytics':
							call('rybbit.event', [event, props]);
							break;
						case 'rudderstack':
							call('rudderanalytics.track', [event, props]);
							break;
						case 'matomo':
						case 'matomo-analytics':
							call('_paq.push', [['trackEvent', 'custom', event]]);
							break;
						default:
							break;
					}
				} catch {
				}
			}
		},
	};
};

export type EventDispatcher = ReturnType<typeof dispatcher>;

export const createEventDispatcher = (
	options: EventDispatcherOptions
): EventDispatcher =>
	dispatcher({
		...options,
		getScripts: () => options.scripts,
		pageviewState: { vendorPaths: new Map() },
	});

export type RuntimeEventDispatcherOptions = Partial<
	Omit<EventDispatcherOptions, 'getSnapshot'>
>;

const pageviewStates = new WeakMap<ConsentRuntime, PageviewState>();

export const getEventDispatcher = (
	runtime: ConsentRuntime,
	options: RuntimeEventDispatcherOptions = {}
): EventDispatcher => {
	let pageviewState = pageviewStates.get(runtime);
	if (!pageviewState) {
		pageviewState = { vendorPaths: new Map() };
		pageviewStates.set(runtime, pageviewState);
	}
	return dispatcher({
		...options,
		getScripts: () =>
			options.scripts
				? [...runtime.scripts, ...options.scripts]
				: runtime.scripts,
		getSnapshot: () => runtime.kernel.getSnapshot(),
		pageviewState,
	});
};
