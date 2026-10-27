import type { Listener, Unsubscribe } from '../types';

export const MAX_DELIVERY_DEPTH = 100;

export const MAX_FINAL_PASS_CALLS = 1000;

interface Registration<Value> {
	listener: Listener<Value>;
}

export interface ListenerSet<Value> {
	add: (listener: Listener<Value>) => Unsubscribe;
	readonly registrations: ReadonlyMap<Listener<Value>, Registration<Value>>;
}

export const createListenerSet = function createListenerSet<
	Value,
>(): ListenerSet<Value> {
	const registrations = new Map<Listener<Value>, Registration<Value>>();
	return {
		add(listener) {
			const registration = registrations.get(listener) ?? { listener };
			registrations.set(listener, registration);
			return () => {
				if (registrations.get(listener) === registration) {
					registrations.delete(listener);
				}
			};
		},
		registrations,
	};
};

export interface Dispatcher {
	deliver: <Value>(listeners: ListenerSet<Value>, value: Value) => void;
	batch: <Result>(run: () => Result) => Result;
}

interface Delivery {
	listeners: ListenerSet<unknown>;
	targets: Registration<unknown>[];
	value: unknown;
	next: number;
}

const pageReportError = function pageReportError():
	| ((error: unknown) => void)
	| undefined {
	if (typeof window === 'undefined' || typeof document === 'undefined') {
		return undefined;
	}
	const report = (window as { reportError?: unknown }).reportError;
	return typeof report === 'function'
		? (error) => {
				report.call(window, error);
			}
		: undefined;
};

const reportListenerError = function reportListenerError(error: unknown): void {
	try {
		const report = pageReportError();
		if (report) {
			report(error);
			return;
		}
		console.error('[c15t] A consent listener threw.', error);
	} catch {
	}
};

export const createDispatcher = function createDispatcher(): Dispatcher {
	const pending: Delivery[] = [];
	let held = 0;
	let depth = 0;
	let queued = 0;
	let cutOff: Set<Listener<unknown>> | null = null;
	let finalPassCalls = 0;

	const supersededLater = function supersededLater(
		from: number,
		listeners: ListenerSet<unknown>,
		target: Registration<unknown>
	): boolean {
		for (let index = from + 1; index < pending.length; index += 1) {
			const later = pending[index];
			if (later?.listeners === listeners && later.targets.includes(target)) {
				return true;
			}
		}
		return false;
	};

	const call = function call(
		delivery: Delivery,
		target: Registration<unknown>
	): void {
		if (cutOff) {
			if (
				cutOff.has(target.listener) ||
				supersededLater(0, delivery.listeners, target)
			) {
				return;
			}
			finalPassCalls += 1;
			if (finalPassCalls > MAX_FINAL_PASS_CALLS) {
				pending.length = 0;
				return;
			}
		}
		const before = queued;
		try {
			target.listener(delivery.value);
		} catch (error) {
			reportListenerError(error);
		}
		if (cutOff && queued !== before) {
			cutOff.add(target.listener);
		}
	};

	const drain = function drain(): void {
		if (cutOff) {
			return;
		}
		if (depth >= MAX_DELIVERY_DEPTH) {
			cutOff = new Set();
			reportListenerError(
				new Error(
					'[c15t] Consent listeners kept updating consent in response to each other; further notifications from them were dropped.'
				)
			);
			return;
		}
		depth += 1;
		try {
			while (pending.length > 0) {
				const [delivery] = pending;
				const target = delivery?.targets[delivery.next];
				if (!(delivery && target)) {
					pending.shift();
					continue;
				}
				delivery.next += 1;
				if (delivery.listeners.registrations.get(target.listener) === target) {
					call(delivery, target);
				}
			}
		} finally {
			depth -= 1;
			if (depth === 0) {
				cutOff = null;
				finalPassCalls = 0;
			}
		}
	};

	return {
		batch(run) {
			held += 1;
			try {
				return run();
			} finally {
				held -= 1;
				if (held === 0) {
					drain();
				}
			}
		},
		deliver(listeners, value) {
			const { registrations } = listeners;
			if (registrations.size === 0) {
				return;
			}
			pending.push({
				listeners: listeners as ListenerSet<unknown>,
				next: 0,
				targets: [...registrations.values()] as Registration<unknown>[],
				value,
			});
			queued += 1;
			if (held === 0) {
				drain();
			}
		},
	};
};
