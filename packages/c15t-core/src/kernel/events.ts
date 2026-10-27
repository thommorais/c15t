import type { KernelEvent, Listener, Unsubscribe } from '../types';
import { createDispatcher, createListenerSet } from './dispatch';
import type { Dispatcher, ListenerSet } from './dispatch';

export interface EventBus {
	on: <E extends KernelEvent['type']>(
		type: E,
		listener: Listener<Extract<KernelEvent, { type: E }>>
	) => Unsubscribe;

	emit: (event: KernelEvent) => void;
}

export const createEventBus = function createEventBus(
	dispatcher: Dispatcher = createDispatcher()
): EventBus {
	let listeners: Map<KernelEvent['type'], ListenerSet<KernelEvent>> | undefined;

	return {
		emit(event) {
			const bucket = listeners?.get(event.type);
			if (bucket) {
				dispatcher.deliver(bucket, event);
			}
		},

		on(type, listener) {
			listeners ??= new Map();
			let bucket = listeners.get(type);
			if (!bucket) {
				bucket = createListenerSet();
				listeners.set(type, bucket);
			}
			return bucket.add(listener as Listener<KernelEvent>);
		},
	};
};
