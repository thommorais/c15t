import type { NetworkBlockerRule } from '@c15t/core/modules/network-blocker';
import {
	holdNetworkRequests,
	releaseNetworkRequests,
} from '@c15t/core/modules/network-hold';
import { useEffect } from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';

import { offline } from '../index';
import { ConsentProvider } from '../provider';
import { policyFixture } from './policy-fixture';

const chunk = vi.hoisted(() => {
	let open = () => {
	};
	const gate = new Promise<void>((resolve) => {
		open = resolve;
	});
	return { gate, open: () => open() };
});

// oxlint-disable-next-line anti-slop/no-module-mocking -- The property under test is what happens before this module loads. The factory holds the chunk back until the file is done, then returns the real module.
vi.mock('@c15t/core/modules/network-blocker', async (importOriginal) => {
	await chunk.gate;
	return await importOriginal();
});

const TRACKER = 'https://tracker.example/collect';
const rules: NetworkBlockerRule[] = [
	{ category: 'measurement', domain: 'tracker.example' },
];

let nativeFetch: typeof window.fetch;
let network: ReturnType<typeof vi.fn>;

beforeEach(() => {
	nativeFetch = window.fetch;
	network = vi.fn(() => Promise.resolve(new Response('ok')));
	window.fetch = network as unknown as typeof window.fetch;
});

afterEach(() => {
	releaseNetworkRequests()();
	window.fetch = nativeFetch;
});

const Beacon = ({ requests }: { requests: Promise<Response>[] }) => {
	useEffect(() => {
		requests.push(window.fetch(TRACKER));
	}, [requests]);
	return null;
};

const flush = () =>
	new Promise<void>((resolve) => {
		setTimeout(resolve, 20);
	});

test('unmounting before the blocker loads fails held requests closed', async () => {
	holdNetworkRequests([{ category: 'marketing', domain: 'ads.example' }]);
	let adsSettled = false;
	const ads = window.fetch('https://ads.example/pixel').finally(() => {
		adsSettled = true;
	});
	const requests: Promise<Response>[] = [];
	const view = await render(
		<ConsentProvider
			options={{
				mode: offline({ acknowledgeNoRecords: true }),
				networkBlocker: { logBlockedRequests: false, rules },
				persistence: false,
				prefetch: policyFixture({ measurement: true }),
			}}
		>
			<Beacon requests={requests} />
		</ConsentProvider>
	);
	await vi.waitFor(() => expect(requests).toHaveLength(1));
	await flush();
	expect(network).not.toHaveBeenCalled();

	await view.unmount();

	const response = await requests[0];
	expect(response?.status).toBe(451);
	expect(response?.statusText).toBe('Request blocked by consent');
	await flush();
	expect(network).not.toHaveBeenCalled();
	expect(adsSettled).toBe(false);

	releaseNetworkRequests()();
	await ads;

	chunk.open();
	await import('@c15t/core/modules/network-blocker');
	expect((await requests[0])?.status).toBe(451);
});
