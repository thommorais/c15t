import type { ConsentSnapshot } from '../../types';
import { buildCallbackInfo, hasAnyCallback, invokeCallback } from './callbacks';
import type { ElementIdResolver } from './normalize';
import type {
	PendingMount,
	Script,
	ScriptLoaderDebugEvent,
	ScriptLoaderTools,
} from './types';

export interface MountDeps {
	tools: Pick<
		ScriptLoaderTools,
		'deniedVendors' | 'gateState' | 'registration'
	>;
	isDisposed: () => boolean;
	getSnapshot: () => ConsentSnapshot;
	getCurrentScript?: (
		scriptId: string,
		snapshot: ConsentSnapshot
	) => { script: Script; hasConsent: boolean } | undefined;
	retainedElements: Map<string, HTMLScriptElement>;
	loadedElements: Map<string, HTMLScriptElement | null>;
	ownedScriptIds: Set<string>;
	elementIds: ElementIdResolver;
	emit: (event: ScriptLoaderDebugEvent) => void;
	hasDebugListener: boolean;
	nonce?: string;
}

const completionContext = (
	deps: MountDeps,
	script: Script,
	hasConsent: boolean,
	elementId: string,
	element: HTMLScriptElement
) => {
	const snapshot = deps.getSnapshot();
	const current = deps.getCurrentScript
		? deps.getCurrentScript(script.id, snapshot)
		: {
				hasConsent:
					deps.retainedElements.get(script.id) === element ? false : hasConsent,
				script,
			};
	if (!current) {
		return;
	}
	return {
		info:
			hasAnyCallback(current.script) || deps.hasDebugListener
				? buildCallbackInfo(
						deps.tools,
						current.script,
						snapshot,
						current.hasConsent,
						elementId,
						element
					)
				: undefined,
		script: current.script,
	};
};

type ElementCompletion = 'load' | 'error';

interface ElementObserver {
	complete: (completion: ElementCompletion) => void;
	scriptId: string;
	stop: () => void;
}

const elementObservers = new WeakMap<
	HTMLScriptElement,
	Map<MountDeps, Map<string, ElementObserver>>
>();

const elementCompletions = new WeakMap<HTMLScriptElement, ElementCompletion>();

const pendingResources = new WeakMap<
	PendingMount[],
	Map<string, PendingMount>
>();

const observeElement = (
	deps: MountDeps,
	script: Script,
	hasConsent: boolean,
	elementId: string,
	element: HTMLScriptElement
): void => {
	let observers = elementObservers.get(element);
	if (!observers) {
		observers = new Map();
		elementObservers.set(element, observers);
	}
	let registrations = observers.get(deps);
	if (!registrations) {
		registrations = new Map();
		observers.set(deps, registrations);
	}
	if (registrations.has(script.id)) {
		return;
	}
	const isRegisteredElement = () =>
		!deps.isDisposed() &&
		(deps.loadedElements.get(script.id) === element ||
			deps.retainedElements.get(script.id) === element);
	const isCurrentElement = () =>
		element.isConnected &&
		document.getElementById(elementId) === element &&
		isRegisteredElement();
	let completed = false;
	const complete = (completion: ElementCompletion) => {
		if (completed || !isCurrentElement()) {
			return;
		}
		completed = true;
		const current = completionContext(
			deps,
			script,
			hasConsent,
			elementId,
			element
		);
		if (current?.info) {
			const info =
				completion === 'error'
					? {
							...current.info,
							error: new Error(`Failed to load script: ${current.script.src}`),
						}
					: current.info;
			invokeCallback(
				current.script,
				completion === 'load' ? 'onLoad' : 'onError',
				info,
				deps.emit
			);
		}
		if (!isRegisteredElement()) {
			return;
		}
		deps.emit({
			action: completion === 'load' ? 'load_completed' : 'error',
			elementId,
			message:
				completion === 'load'
					? 'Script finished loading'
					: `Script failed: ${script.src}`,
			scope: 'lifecycle',
			scriptId: script.id,
			source: 'script-loader',
			timestamp: Date.now(),
		});
	};
	const onLoad = () => {
		elementCompletions.set(element, 'load');
		complete('load');
	};
	const onError = () => {
		elementCompletions.set(element, 'error');
		complete('error');
	};
	if (script.src) {
		element.addEventListener('load', onLoad);
		element.addEventListener('error', onError);
	}
	registrations.set(script.id, {
		complete,
		scriptId: script.id,
		stop: () => {
			completed = true;
			element.removeEventListener('load', onLoad);
			element.removeEventListener('error', onError);
		},
	});
	const completion = elementCompletions.get(element);
	if (completion) {
		queueMicrotask(() => complete(completion));
	}
};

type ServerStartedElement = HTMLScriptElement & {
	__c15tAdopted?: boolean;
	__c15tConsent?: boolean;
	__c15tDone?: ElementCompletion;
	__c15tHeld?: boolean;
	__c15tInsert?: () => void;
	__c15tScript?: string;
};

type ServerStartedRegistry = Record<string, ServerStartedElement>;

const notYetInserted = function notYetInserted(
	element: ServerStartedElement | null | undefined
): boolean {
	return Boolean(element?.__c15tInsert || element?.__c15tHeld);
};

const serverStartedRegistry = function serverStartedRegistry():
	| ServerStartedRegistry
	| undefined {
	return (globalThis as { __c15tStarted?: ServerStartedRegistry })
		.__c15tStarted;
};

const forgetServerStarted = function forgetServerStarted(
	element: ServerStartedElement
): void {
	const started = serverStartedRegistry();
	for (const key of Object.keys(started ?? {})) {
		if (started?.[key] === element) {
			Reflect.deleteProperty(started, key);
		}
	}
};

export const releaseScriptElement = (
	deps: MountDeps,
	scriptId: string,
	element: HTMLScriptElement
): void => {
	const observers = elementObservers.get(element);
	const registrations = observers?.get(deps);
	const observer = registrations?.get(scriptId);
	registrations?.delete(scriptId);
	observer?.stop();
	if (registrations?.size === 0) {
		observers?.delete(deps);
	}
	const survivor = observers?.entries().next().value;
	if (deps.ownedScriptIds.has(scriptId)) {
		if (survivor) {
			const [nextDeps, nextRegistrations] = survivor;
			const nextObserver = nextRegistrations.values().next().value;
			if (nextObserver) {
				nextDeps.ownedScriptIds.add(nextObserver.scriptId);
			}
		} else {
			const started = element as ServerStartedElement;
			delete started.__c15tInsert;
			delete started.__c15tHeld;
			forgetServerStarted(started);
			element.parentNode?.removeChild(element);
		}
	}
	deps.ownedScriptIds.delete(scriptId);
	if (observers?.size === 0) {
		elementObservers.delete(element);
	}
};

const completeMount = (deps: MountDeps, pending: PendingMount): void => {
	const { script, element, elementId, hasConsent } = pending;
	if (deps.loadedElements.get(script.id) !== element) {
		return;
	}
	if (!pending.appended) {
		releaseScriptElement(deps, script.id, element);
		deps.loadedElements.delete(script.id);
		deps.ownedScriptIds.delete(script.id);
		return;
	}
	if (deps.isDisposed()) {
		return;
	}
	if (!script.src) {
		setTimeout(() => {
			elementCompletions.set(element, 'load');
			for (const registrations of elementObservers.get(element)?.values() ??
				[]) {
				for (const observer of registrations.values()) {
					observer.complete('load');
				}
			}
		}, 0);
	}
	deps.emit({
		action: 'loaded',
		elementId,
		hasConsent,
		message: 'Script mounted',
		scope: 'lifecycle',
		scriptId: script.id,
		source: 'script-loader',
		timestamp: Date.now(),
	});
};

const serverStartedFor = function serverStartedFor(
	script: Script
): ServerStartedElement | undefined {
	(globalThis as { __c15tLoaderRan?: boolean }).__c15tLoaderRan = true;
	const started = serverStartedRegistry();
	const key = script.resourceKey ?? script.id;
	const element = started?.[key];
	if (!(started && element)) {
		return;
	}
	if (element.isConnected || notYetInserted(element)) {
		return element;
	}
	Reflect.deleteProperty(started, key);
};

const adoptServerStarted = function adoptServerStarted(
	deps: MountDeps,
	script: Script,
	snapshot: ConsentSnapshot,
	hasConsent: boolean,
	elementId: string,
	element: ServerStartedElement
): void {
	const startedWithConsent = element.__c15tConsent ?? true;
	element.__c15tAdopted = true;
	element.id = elementId;
	if (element.__c15tDone) {
		elementCompletions.set(element, element.__c15tDone);
	}
	deps.loadedElements.set(script.id, element);
	deps.ownedScriptIds.add(script.id);
	if (hasAnyCallback(script) || deps.hasDebugListener) {
		const info = buildCallbackInfo(
			deps.tools,
			script,
			snapshot,
			startedWithConsent,
			elementId,
			element
		);
		info.startedOnServer = true;
		invokeCallback(script, 'onBeforeLoad', info, deps.emit);
		if (startedWithConsent !== hasConsent) {
			invokeCallback(
				script,
				'onConsentChange',
				buildCallbackInfo(
					deps.tools,
					script,
					snapshot,
					hasConsent,
					elementId,
					element
				),
				deps.emit
			);
		}
	}
	observeElement(deps, script, hasConsent, elementId, element);
	const event: ScriptLoaderDebugEvent = {
		action: 'already_loaded',
		elementId,
		hasConsent,
		message: 'Adopted the script element the server started',
		scope: 'step',
		scriptId: script.id,
		source: 'script-loader',
		timestamp: Date.now(),
	};
	const serverSrc = element.getAttribute('src');
	if (serverSrc !== script.src) {
		event.data = { serverSrc };
		event.message = `Adopted the script element the server started from ${serverSrc}, not ${script.src}. Render the same src on the server and the client.`;
	}
	deps.emit(event);
};

const adoptToRevoke = function adoptToRevoke(
	deps: MountDeps,
	script: Script,
	snapshot: ConsentSnapshot
): ServerStartedElement | undefined {
	const started = serverStartedFor(script);
	if (!started || started.__c15tAdopted || started.__c15tScript !== script.id) {
		return;
	}
	adoptServerStarted(
		deps,
		script,
		snapshot,
		started.__c15tConsent ?? true,
		deps.elementIds.resolve(script),
		started
	);
	return started;
};

// oxlint-disable-next-line complexity -- Preserve established branch order and control flow.
export const mountScript = function mountScript(
	deps: MountDeps,
	script: Script,
	snapshot: ConsentSnapshot,
	hasConsent: boolean,
	batch: PendingMount[] | null,
	isCurrentPass: () => boolean = () => true
): void {
	if (typeof document === 'undefined') {
		return;
	}
	const elementId = deps.elementIds.resolve(script);

	if (deps.loadedElements.has(script.id)) {
		if (typeof script.onConsentChange === 'function' || deps.hasDebugListener) {
			const existing = deps.loadedElements.get(script.id) ?? undefined;
			const info = buildCallbackInfo(
				deps.tools,
				script,
				snapshot,
				hasConsent,
				elementId,
				existing
			);
			invokeCallback(script, 'onConsentChange', info, deps.emit);
		}
		deps.emit({
			action: 'already_loaded',
			elementId,
			hasConsent,
			message: 'Script already mounted',
			scope: 'step',
			scriptId: script.id,
			source: 'script-loader',
			timestamp: Date.now(),
		});
		return;
	}

	if (script.callbackOnly === true) {
		const info = buildCallbackInfo(
			deps.tools,
			script,
			snapshot,
			hasConsent,
			elementId,
			undefined
		);
		invokeCallback(script, 'onBeforeLoad', info, deps.emit);
		if (deps.isDisposed() || !isCurrentPass()) {
			return;
		}
		invokeCallback(script, 'onLoad', info, deps.emit);
		deps.loadedElements.set(script.id, null);
		deps.emit({
			action: 'loaded',
			elementId: info.elementId,
			hasConsent: info.hasConsent,
			message: 'Callback-only script loaded',
			scope: 'lifecycle',
			scriptId: script.id,
			source: 'script-loader',
			timestamp: Date.now(),
		});
		return;
	}

	if (script.src && script.textContent) {
		throw new Error(
			`Script '${script.id}' cannot have both 'src' and 'textContent'. Choose one.`
		);
	}
	if (!script.src && !script.textContent) {
		throw new Error(
			`Script '${script.id}' must have either 'src', 'textContent', or 'callbackOnly' set to true.`
		);
	}

	const started = serverStartedFor(script);
	if (started && !started.__c15tAdopted) {
		adoptServerStarted(deps, script, snapshot, hasConsent, elementId, started);
		if (started.__c15tHeld && !deps.isDisposed()) {
			delete started.__c15tHeld;
			(script.target === 'body'
				? (document.body ?? document.head)
				: document.head
			).appendChild(started);
		}
		return;
	}

	const existingElement =
		started ??
		(typeof document.getElementById === 'function'
			? document.getElementById(elementId)
			: null);
	if (existingElement) {
		const element = existingElement as HTMLScriptElement;
		deps.loadedElements.set(script.id, element);
		observeElement(deps, script, hasConsent, elementId, element);
		if (typeof script.onConsentChange === 'function' || deps.hasDebugListener) {
			const info = buildCallbackInfo(
				deps.tools,
				script,
				snapshot,
				hasConsent,
				elementId,
				element
			);
			invokeCallback(script, 'onConsentChange', info, deps.emit);
		}
		deps.emit({
			action: 'already_loaded',
			elementId,
			hasConsent,
			message: 'Script element already exists in DOM; reused it',
			scope: 'step',
			scriptId: script.id,
			source: 'script-loader',
			timestamp: Date.now(),
		});
		return;
	}

	const pendingResource = batch
		? pendingResources.get(batch)?.get(elementId)
		: undefined;
	const element = pendingResource?.element ?? document.createElement('script');
	if (!pendingResource) {
		element.id = elementId;
		if (script.src) {
			element.src = script.src;
		}
		if (script.textContent) {
			element.textContent = script.textContent;
		}
		if (script.async !== undefined) {
			element.async = script.async;
		}
		if (script.defer !== undefined) {
			element.defer = script.defer;
		}
		const nonce = script.nonce ?? deps.nonce;
		if (nonce) {
			element.nonce = nonce;
		}
		if (script.fetchPriority) {
			// oxlint-disable-next-line typescript/no-explicit-any -- browser API not yet in lib.dom
			(element as any).fetchPriority = script.fetchPriority;
		}
		if (script.attributes) {
			for (const [key, value] of Object.entries(script.attributes)) {
				element.setAttribute(
					key,
					typeof value === 'string' ? value : String(value)
				);
			}
		}
	}

	const infoCallers = hasAnyCallback(script) || deps.hasDebugListener;
	const info = infoCallers
		? buildCallbackInfo(
				deps.tools,
				script,
				snapshot,
				hasConsent,
				elementId,
				element
			)
		: undefined;
	if (info) {
		invokeCallback(script, 'onBeforeLoad', info, deps.emit);
	}

	if (deps.isDisposed()) {
		return;
	}

	observeElement(deps, script, hasConsent, elementId, element);

	const target =
		pendingResource?.target ??
		(script.target === 'body' ? document.body : document.head);

	if (batch) {
		const pending: PendingMount = {
			appended: false,
			element,
			elementId,
			hasConsent,
			info,
			script,
			target,
		};
		batch.push(pending);
		let resources = pendingResources.get(batch);
		if (!resources) {
			resources = new Map();
			pendingResources.set(batch, resources);
		}
		resources.set(elementId, pending);
		return;
	}

	deps.loadedElements.set(script.id, element);
	deps.ownedScriptIds.add(script.id);
	target.appendChild(element);
	completeMount(deps, {
		appended: true,
		element,
		elementId,
		hasConsent,
		info,
		script,
		target,
	});
};

export const unmountScript = function unmountScript(
	deps: MountDeps,
	script: Script,
	snapshot: ConsentSnapshot,
	hasConsent: boolean,
	removeConfiguration = false
): void {
	let element = deps.loadedElements.get(script.id);
	if (
		element === undefined &&
		(removeConfiguration || !script.persistAfterConsentRevoked)
	) {
		element = deps.retainedElements.get(script.id);
	}
	if (element === undefined) {
		element = adoptToRevoke(deps, script, snapshot);
	}
	if (element === undefined) {
		if (
			script.observeConsentBeforeLoad &&
			typeof script.onConsentChange === 'function' &&
			typeof document !== 'undefined'
		) {
			invokeCallback(
				script,
				'onConsentChange',
				buildCallbackInfo(
					deps.tools,
					script,
					snapshot,
					hasConsent,
					deps.elementIds.resolve(script)
				),
				deps.emit
			);
		}
		return;
	}

	const elementId = deps.elementIds.resolve(script);

	const neverInserted = notYetInserted(element);
	if (
		script.persistAfterConsentRevoked &&
		!removeConfiguration &&
		!neverInserted
	) {
		if (element) {
			deps.retainedElements.set(script.id, element);
		}
		deps.loadedElements.delete(script.id);
		if (typeof script.onConsentChange === 'function') {
			const info = buildCallbackInfo(
				deps.tools,
				script,
				snapshot,
				hasConsent,
				elementId,
				element ?? undefined
			);
			invokeCallback(script, 'onConsentChange', info, deps.emit);
		}
		deps.emit({
			action: 'unloaded',
			data: { retained: true },
			elementId,
			message: 'Script persisted after consent revoked',
			scope: 'lifecycle',
			scriptId: script.id,
			source: 'script-loader',
			timestamp: Date.now(),
		});
		return;
	}

	if (element) {
		releaseScriptElement(deps, script.id, element);
	}
	deps.loadedElements.delete(script.id);
	deps.retainedElements.delete(script.id);
	deps.ownedScriptIds.delete(script.id);

	if (typeof script.onConsentChange === 'function') {
		const info = buildCallbackInfo(
			deps.tools,
			script,
			snapshot,
			hasConsent,
			elementId
		);
		invokeCallback(script, 'onConsentChange', info, deps.emit);
	}

	deps.emit({
		action: 'unloaded',
		elementId,
		message: 'Script unmounted',
		scope: 'lifecycle',
		scriptId: script.id,
		source: 'script-loader',
		timestamp: Date.now(),
	});
};

export const flushPendingMounts = function flushPendingMounts(
	deps: MountDeps,
	batch: PendingMount[],
	isCurrentPass: () => boolean = () => true
): void {
	pendingResources.delete(batch);
	if (batch.length === 0 || !isCurrentPass()) {
		return;
	}
	const resources = new Set<HTMLScriptElement>();
	for (const pending of batch) {
		deps.loadedElements.set(pending.script.id, pending.element);
		if (!resources.has(pending.element)) {
			deps.ownedScriptIds.add(pending.script.id);
			resources.add(pending.element);
		}
	}

	if (batch.length === 1) {
		// oxlint-disable-next-line prefer-destructuring -- Preserve declaration order, interface shape, and public compatibility.
		const only = batch[0];
		if (!only) {
			return;
		}
		only.target.appendChild(only.element);
		only.appended = true;
	} else {
		const byTarget = new Map<HTMLElement, PendingMount[]>();
		for (const pending of batch) {
			const list = byTarget.get(pending.target);
			if (list) {
				list.push(pending);
			} else {
				byTarget.set(pending.target, [pending]);
			}
		}
		for (const [target, entries] of byTarget) {
			if (deps.isDisposed() || !isCurrentPass()) {
				break;
			}
			const elements = [
				...new Set(
					entries
						.filter(
							({ script, element }) =>
								deps.loadedElements.get(script.id) === element
						)
						.map((pending) => {
							pending.appended = true;
							return pending.element;
						})
				),
			];
			if (elements.length === 0) {
				continue;
			}
			if (elements.length === 1) {
				// oxlint-disable-next-line prefer-destructuring -- Preserve declaration order, interface shape, and public compatibility.
				const first = elements[0];
				if (first) {
					target.appendChild(first);
				}
				continue;
			}
			const fragment = document.createDocumentFragment();
			for (const element of elements) {
				fragment.appendChild(element);
			}
			target.appendChild(fragment);
		}
	}

	for (const pending of batch) {
		completeMount(deps, pending);
	}
};
