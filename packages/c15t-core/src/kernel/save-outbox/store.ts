import {
	PENDING_SAVES_STORAGE_KEY,
	SUBJECT_REASSIGNMENTS_STORAGE_KEY,
} from '../../libs/storage-keys';

export type OutboxSlot = 'saves' | 'reassignments';

export interface OutboxTransaction {
	read: (slot: OutboxSlot) => unknown;
	write: (slot: OutboxSlot, value: readonly unknown[]) => boolean;
}

export interface SaveOutboxStore {
	transact: <Result>(run: (tx: OutboxTransaction) => Result) => Promise<Result>;
	clear: () => void;
}

type TextStorage = Pick<Storage, 'getItem' | 'removeItem' | 'setItem'>;

export interface BrowserOutboxEnvironment {
	localStorage: () => TextStorage | null;
	locks: () => LockManager | null;
}

const browserEnvironment: BrowserOutboxEnvironment = {
	localStorage() {
		try {
			return typeof window === 'undefined' ? null : window.localStorage;
		} catch {
			return null;
		}
	},
	locks() {
		try {
			const locks =
				typeof navigator === 'undefined'
					? undefined
					: (navigator as Partial<Navigator>).locks;
			return locks && typeof locks.request === 'function' ? locks : null;
		} catch {
			return null;
		}
	},
};

const SLOT_KEYS: Record<OutboxSlot, string> = {
	reassignments: SUBJECT_REASSIGNMENTS_STORAGE_KEY,
	saves: PENDING_SAVES_STORAGE_KEY,
};

export const createBrowserOutboxStore = function createBrowserOutboxStore(
	environment: BrowserOutboxEnvironment = browserEnvironment
): SaveOutboxStore {
	const values = new Map<string, string>();
	const memory: TextStorage = {
		getItem: (key) => values.get(key) ?? null,
		removeItem: (key) => {
			values.delete(key);
		},
		setItem: (key, value) => {
			values.set(key, value);
		},
	};
	return {
		clear() {
			const storage = environment.localStorage() ?? memory;
			for (const key of Object.values(SLOT_KEYS)) {
				try {
					storage.removeItem(key);
				} catch {
				}
			}
		},
		async transact(run) {
			const storage = environment.localStorage() ?? memory;
			const tx: OutboxTransaction = {
				read(slot) {
					try {
						const text = storage.getItem(SLOT_KEYS[slot]);
						return text === null ? undefined : JSON.parse(text);
					} catch {
						return null;
					}
				},
				write(slot, value) {
					try {
						if (value.length === 0) {
							storage.removeItem(SLOT_KEYS[slot]);
						} else {
							storage.setItem(SLOT_KEYS[slot], JSON.stringify(value));
						}
						return true;
					} catch {
						return false;
					}
				},
			};
			const locks = storage === memory ? null : environment.locks();
			if (!locks) {
				return run(tx);
			}
			try {
				return await locks.request(PENDING_SAVES_STORAGE_KEY, () => run(tx));
			} catch {
				return run(tx);
			}
		},
	};
};

export const createMemoryOutboxStore =
	function createMemoryOutboxStore(): SaveOutboxStore {
		return createBrowserOutboxStore({
			localStorage: () => null,
			locks: () => null,
		});
	};
