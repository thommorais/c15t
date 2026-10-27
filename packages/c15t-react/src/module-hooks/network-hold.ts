'use client';

import type { NetworkBlockerRule } from '@c15t/core/modules/network-blocker';
import { holdNetworkRequests, NOT_HELD } from '@c15t/core/modules/network-hold';
import type { NetworkHold } from '@c15t/core/modules/network-hold';
import { useState } from 'react';

export const UNCOMMITTED_HOLD_MS = 10_000;

export interface EarlyNetworkHold {
	claim: (
		rules: readonly NetworkBlockerRule[],
		enabled: boolean | undefined
	) => NetworkHold;
	unmount: () => void;
}

interface Slot extends EarlyNetworkHold {
	expire: () => void;
	key: string;
}

const uncommitted = new Set<Slot>();

const createSlot = function createSlot(
	rules: readonly NetworkBlockerRule[],
	enabled: boolean | undefined
): Slot {
	let hold: NetworkHold | undefined;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let mounts = 0;
	const slot: Slot = {
		claim(latestRules, latestEnabled) {
			uncommitted.delete(slot);
			clearTimeout(timer);
			mounts += 1;
			if (latestEnabled !== false && !hold?.held) {
				hold = holdNetworkRequests(latestRules);
			}
			for (const other of uncommitted) {
				if (other.key === slot.key) {
					other.expire();
				}
			}
			return hold ?? NOT_HELD;
		},
		expire() {
			uncommitted.delete(slot);
			clearTimeout(timer);
			hold?.block();
		},
		key: '',
		unmount() {
			const mount = mounts;
			const current = hold;
			queueMicrotask(() => {
				if (mounts === mount) {
					current?.block();
				}
			});
		},
	};
	if (typeof window !== 'undefined' && enabled !== false) {
		hold = holdNetworkRequests(rules);
		slot.key = JSON.stringify(rules);
		uncommitted.add(slot);
		timer = setTimeout(() => slot.expire(), UNCOMMITTED_HOLD_MS);
	}
	return slot;
};

export const useEarlyNetworkHold = function useEarlyNetworkHold(
	rules: readonly NetworkBlockerRule[],
	enabled: boolean | undefined
): EarlyNetworkHold {
	// oxlint-disable-next-line react/hook-use-state -- Created once, during the first render.
	const [slot] = useState(() => createSlot(rules, enabled));
	return slot;
};
