import { parseJourneyId } from '@c15t/schema/types';

import {
	openJourney,
	readEarlyJourney,
	sessionStorageOf,
} from '../libs/journey';
import type { ConsentJourneyOption, JourneyStorage } from '../libs/journey';
import { JOURNEY_STORAGE_KEY } from '../libs/storage-keys';
import type {
	ConsentKernel,
	ConsentSnapshot,
	KernelJourney,
	KernelTransport,
	SavePayload,
} from '../types';

export type { JourneyStorage } from '../libs/journey';

const hasStoredAnswer = (
	snapshot: Pick<ConsentSnapshot, 'explicitChoice' | 'noticeDismissal'>
): boolean =>
	snapshot.explicitChoice !== null || snapshot.noticeDismissal !== null;

export interface JourneyControllerOptions {
	option: ConsentJourneyOption | undefined;
	serverId?: string;
	storage?: () => JourneyStorage | null;
}

export interface JourneyController {
	start: (kernel: ConsentKernel) => () => void;
	adopt: (id: string | null | undefined) => void;
	forInit: () => KernelJourney | undefined;
	forSave: () => SavePayload['journey'];
}

export const createJourneyController = function createJourneyController(
	options: JourneyControllerOptions
): JourneyController {
	const storage = options.storage ?? sessionStorageOf;
	let serverId = parseJourneyId(options.serverId);
	let journey: KernelJourney | undefined;
	let continued = false;
	let sent = false;
	let stored = false;
	let off = false;
	let answered = false;

	const asPage = function asPage(): void {
		if (journey && journey.scope !== 'page') {
			journey = Object.freeze({ ...journey, scope: 'page' as const });
		}
	};

	const forgetTab = function forgetTab(): void {
		stored = false;
		continued = false;
		if (options.option !== 'tab') {
			return;
		}
		try {
			storage()?.removeItem(JOURNEY_STORAGE_KEY);
		} catch {
		}
	};

	const create = function create(kernel: ConsentKernel): void {
		const fromServer = serverId !== null;
		const opened = openJourney({
			adopted: serverId ?? readEarlyJourney()?.id,
			option: fromServer && options.option === 'tab' ? 'page' : options.option,
			storage,
			storedChoice: hasStoredAnswer(kernel.getSnapshot()),
		});
		if (!opened) {
			return;
		}
		({ journey, continued } = opened);
		stored = continued;
		if (fromServer) {
			forgetTab();
		}
	};

	const write = function write(): void {
		if (!journey || stored || answered) {
			return;
		}
		try {
			const store = storage();
			if (!store) {
				asPage();
				return;
			}
			store.setItem(JOURNEY_STORAGE_KEY, journey.id);
			stored = true;
		} catch {
			asPage();
		}
	};

	const remove = function remove(): void {
		if (!stored) {
			return;
		}
		stored = false;
		try {
			storage()?.removeItem(JOURNEY_STORAGE_KEY);
		} catch {
		}
	};

	const owesNoPrompt = function owesNoPrompt(
		snapshot: ConsentSnapshot
	): boolean {
		if (snapshot.activeUI !== 'none') {
			return false;
		}
		if (snapshot.resolution.status === 'failed') {
			return true;
		}
		return (
			!snapshot.policyPending &&
			!snapshot.experimentPending &&
			snapshot.promptRequirement.kind === 'none'
		);
	};

	const watch = function watch(kernel: ConsentKernel): () => void {
		const sync = function sync(): void {
			if (journey?.scope !== 'tab') {
				return;
			}
			const snapshot = kernel.getSnapshot();
			if (snapshot.explicitChoice !== null || owesNoPrompt(snapshot)) {
				remove();
			} else if (snapshot.activeUI !== 'none') {
				write();
			}
		};
		const answer = function answer(): void {
			answered = true;
			remove();
		};
		const unsubscribers = [
			kernel.subscribe(sync),
			kernel.events.on('choice:recorded', answer),
			kernel.events.on('notice:dismissed', answer),
		];
		sync();
		return function stopWatching() {
			for (const unsubscribe of unsubscribers) {
				unsubscribe();
			}
		};
	};

	return {
		adopt(id) {
			if (id === null) {
				if (!sent) {
					remove();
					off = true;
					journey = undefined;
				}
				return;
			}
			const parsed = parseJourneyId(id);
			if (!parsed || sent) {
				return;
			}
			if (!journey) {
				serverId = parsed;
				return;
			}
			journey = Object.freeze({ ...journey, id: parsed, scope: 'page' });
			forgetTab();
		},
		forInit: () => journey,
		forSave() {
			if (!journey) {
				return undefined;
			}
			sent = true;
			return { id: journey.id, scope: journey.scope };
		},
		start(kernel) {
			if (!(journey || off)) {
				create(kernel);
			}
			return journey?.scope === 'tab' ? watch(kernel) : () => undefined;
		},
	};
};

export const withJourney = function withJourney(
	transport: KernelTransport,
	journey: Pick<JourneyController, 'forInit' | 'forSave'>
): KernelTransport {
	const wrapped: KernelTransport = {};
	if (transport.init) {
		wrapped.init = (ctx) => {
			const next = { ...ctx };
			Object.defineProperty(next, 'journey', {
				configurable: true,
				enumerable: true,
				get: journey.forInit,
			});
			return (transport.init as NonNullable<KernelTransport['init']>)(next);
		};
	}
	if (transport.save) {
		wrapped.save = (payload, context) => {
			const save = transport.save as NonNullable<KernelTransport['save']>;
			if (context?.replay) {
				return save(payload, context);
			}
			const current = journey.forSave();
			return save(current ? { ...payload, journey: current } : payload);
		};
	}
	if (transport.identify) {
		wrapped.identify = (user, subjectId) =>
			(transport.identify as NonNullable<KernelTransport['identify']>)(
				user,
				subjectId
			);
	}
	if (transport.loadSubjectRecord) {
		wrapped.loadSubjectRecord = (subjectId) =>
			(
				transport.loadSubjectRecord as NonNullable<
					KernelTransport['loadSubjectRecord']
				>
			)(subjectId);
	}
	return wrapped;
};
