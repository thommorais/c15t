import type { ConsentKernel, KernelConfig } from '../types';
import { createChoiceRecorder } from './choice';
import { createDispatcher } from './dispatch';
import { createEventBus } from './events';
import { createInitLifecycle } from './init-lifecycle';
import type { InternalKernel } from './internals';
import { createRecordsBoundary } from './records';
import { createRuntime } from './runtime';
import { createBrowserOutboxStore, createSaveOutbox } from './save-outbox';
import type { SaveOutboxOptions } from './save-outbox';
import type { SaveOutboxStore } from './save-outbox/store';
import { buildSetters } from './setters';
import { buildDraft, buildInitialSnapshot } from './snapshot';

export interface KernelSeams {
	outboxStore?: SaveOutboxStore;
	loadOutboxQueue?: () => Promise<unknown>;
}

export const createKernel = function createKernel(
	config: KernelConfig = {},
	seams: KernelSeams = {}
): InternalKernel {
	const { transport } = config;
	const dispatcher = createDispatcher();
	const eventBus = createEventBus(dispatcher);
	const initialSnapshot = buildInitialSnapshot(config);
	const serverSnapshot = initialSnapshot;

	const runtime = createRuntime({
		dispatcher,
		emit: eventBus.emit,
		initialSnapshot,
		// oxlint-disable-next-line no-use-before-define -- Commits run only after assembly.
		onDeadlineChange: () => lifecycle.armDeadline(),
	});
	const outbox = createSaveOutbox({
		loadQueue: seams.loadOutboxQueue as SaveOutboxOptions['loadQueue'],
		// oxlint-disable-next-line no-use-before-define -- Called only after a send, once the lifecycle exists.
		retryWhenOnline: () => lifecycle.retryWhenOnline(),
		runtime,
		store: seams.outboxStore ?? createBrowserOutboxStore(),
		transport,
	});
	eventBus.on('records:cleared', () => {
		void outbox.clear();
	});
	const lifecycle = createInitLifecycle({
		initRetry: config.initRetry,
		outbox,
		runtime,
		translationOverrides: config.translationOverrides,
		transport,
	});
	const records = createRecordsBoundary({
		runtime,
		start: lifecycle.start,
		transport,
	});
	const choice = createChoiceRecorder({
		initialDraft: buildDraft(config.initialDraft),
		outbox,
		runtime,
	});

	return {
		adoptInit: lifecycle.adopt,
		commands: {
			dismissNotice: choice.dismissNotice,
			identify: records.identify,
			init: lifecycle.init,
			save: choice.save,
		},
		dispose: lifecycle.dispose,
		events: {
			emit: eventBus.emit,
			on: eventBus.on,
		},
		getRecordsGeneration: runtime.getGeneration,
		getServerSnapshot: () => serverSnapshot,
		getSnapshot: runtime.getSnapshot,
		holdSaves: outbox.hold,
		hydrate: records.hydrate,
		markLive: runtime.markLive,
		refresh: lifecycle.refresh,
		set: {
			...buildSetters(runtime, config),
			draft: choice.draft,
			subjectId: records.setSubjectId,
		},
		subscribe: runtime.subscribe,
	};
};

export const createConsentKernel: (config?: KernelConfig) => ConsentKernel =
	createKernel;
