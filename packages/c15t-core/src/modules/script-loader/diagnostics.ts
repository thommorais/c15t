import type { ConsentKernel } from '../../types';
import type { Script, ScriptLoaderDebugEvent } from './types';

export type ScriptDiagnosticStatus =
	| 'blocked'
	| 'pending'
	| 'loading'
	| 'loaded'
	| 'present'
	| 'retained'
	| 'error';

export interface ScriptDiagnostic {
	readonly loaderId: number;
	readonly id: string;
	readonly elementId: string;
	readonly src?: string;
	readonly category: Script['category'];
	readonly status: ScriptDiagnosticStatus;
	readonly eligible: boolean;
	readonly hasConsent: boolean;
	readonly vendorId?: Script['vendorId'];
	readonly vendor?: Script['vendor'];
	readonly callbackOnly: boolean;
	readonly alwaysLoad: boolean;
	readonly persistAfterConsentRevoked: boolean;
	readonly lastEvent?: ScriptLoaderDebugEvent;
}

type Listener = (event?: ScriptLoaderDebugEvent) => void;
interface Registry {
	loaders: Map<number, () => readonly ScriptDiagnostic[]>;
	listeners: Set<Listener>;
}

const registries = new WeakMap<ConsentKernel, Registry>();
let nextLoaderId = 0;

const registryFor = (kernel: ConsentKernel): Registry => {
	let registry = registries.get(kernel);
	if (!registry) {
		registry = { listeners: new Set(), loaders: new Map() };
		registries.set(kernel, registry);
	}
	return registry;
};

export const registerScriptDiagnostics = (
	kernel: ConsentKernel,
	read: (loaderId: number) => readonly ScriptDiagnostic[]
) => {
	const registry = registryFor(kernel);
	nextLoaderId += 1;
	const loaderId = nextLoaderId;
	const notify = (event?: ScriptLoaderDebugEvent): void => {
		for (const listener of registry.listeners) {
			try {
				listener(event);
			} catch {
			}
		}
	};
	registry.loaders.set(loaderId, () => read(loaderId));
	notify();
	return {
		dispose() {
			registry.loaders.delete(loaderId);
			notify();
		},
		notify,
	};
};

export const getScriptDiagnostics = (
	kernel: ConsentKernel
): readonly ScriptDiagnostic[] =>
	[...(registries.get(kernel)?.loaders.values() ?? [])].flatMap((read) =>
		read()
	);

export const subscribeScriptDiagnostics = (
	kernel: ConsentKernel,
	listener: Listener
): (() => void) => {
	const registry = registryFor(kernel);
	registry.listeners.add(listener);
	return () => {
		registry.listeners.delete(listener);
	};
};
