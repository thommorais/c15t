import {
	createConsentKernel,
	createHostedTransport,
	earlyInitModes,
} from '@c15t/core';
import type { EarlyInitMode, ProviderTransportFactory } from '@c15t/core';
import { createPersistence } from '@c15t/core/modules/persistence';
import { writePolicyResolutionWire } from '@c15t/schema/types';
import { StrictMode, useEffect } from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';

import { useSnapshot } from '../index';
import { ConsentProvider } from '../provider';
import { policyFixture } from './policy-fixture';

const BACKEND = 'https://consent.example/api/c15t';

const initBody = (id: string) =>
	JSON.stringify({
		branding: 'c15t',
		location: { countryCode: 'DE', regionCode: null },
		policyResolution: writePolicyResolutionWire(
			policyFixture({}, { id }).initialPolicyResolution
		),
		translations: { language: 'en', translations: {} },
	});

let respond: ((policyId: string) => void)[];
let backendFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
	localStorage.clear();
	sessionStorage.clear();
	delete (window as Window & { __c15tJourney?: unknown }).__c15tJourney;
	respond = [];
	backendFetch = vi.fn(
		() =>
			new Promise<Response>((resolve) => {
				respond.push((policyId) =>
					resolve(
						new Response(initBody(policyId), {
							headers: { 'x-c15t-policy-contract': '1' },
						})
					)
				);
			})
	);
});

afterEach(() => {
	vi.restoreAllMocks();
});

const initCalls = () =>
	backendFetch.mock.calls.filter(([url]) =>
		String(url).split('?')[0]?.endsWith('/init')
	);

const backend = {};

const registeredMode = function registeredMode(
	requestsInit: boolean
): ProviderTransportFactory {
	const factory = Object.assign(
		() => createHostedTransport({ backendURL: BACKEND, fetch: backendFetch }),
		{ kind: 'custom' as const }
	);
	const entry: EarlyInitMode & { backend: object } = {
		backend,
		requestsInit: () => requestsInit,
		sameAs: (other) => (other as { backend?: object }).backend === backend,
	};
	earlyInitModes.set(factory, entry);
	return factory;
};

const Timing = ({
	atRender,
	atMount,
}: {
	atRender: number[];
	atMount: number[];
}) => {
	atRender.push(initCalls().length);
	useEffect(() => {
		atMount.push(initCalls().length);
	}, [atMount]);
	return null;
};

const PolicyProbe = () => {
	const snapshot = useSnapshot();
	return (
		<output data-testid="policy">
			{snapshot.policyPending ? 'pending' : snapshot.policyRule.id}
		</output>
	);
};

test('sends /init during render, before mount effects, once under StrictMode', async () => {
	const atRender: number[] = [];
	const atMount: number[] = [];
	const options = { mode: registeredMode(true), persistence: false as const };
	const view = await render(
		<StrictMode>
			<ConsentProvider options={options}>
				<Timing
					atMount={atMount}
					atRender={atRender}
				/>
				<PolicyProbe />
			</ConsentProvider>
		</StrictMode>
	);

	expect(atRender[0]).toBe(1);
	expect(atMount[0]).toBe(1);
	await expect.element(view.getByTestId('policy')).toHaveTextContent('pending');
	expect(initCalls()).toHaveLength(1);

	respond[0]?.('early');
	await expect.element(view.getByTestId('policy')).toHaveTextContent('early');
	expect(initCalls()).toHaveLength(1);
	await view.unmount();
});

test('a mode each render builds again sends one request, during render', async () => {
	const atRender: number[] = [];
	const atMount: number[] = [];
	const App = () => (
		<ConsentProvider
			options={{ mode: registeredMode(true), persistence: false }}
		>
			<Timing
				atMount={atMount}
				atRender={atRender}
			/>
			<PolicyProbe />
		</ConsentProvider>
	);
	const view = await render(
		<StrictMode>
			<App />
		</StrictMode>
	);
	expect(atRender[0]).toBe(1);
	expect(initCalls()).toHaveLength(1);
	respond[0]?.('early');
	await expect.element(view.getByTestId('policy')).toHaveTextContent('early');
	expect(initCalls()).toHaveLength(1);
	await view.unmount();
});

test('sends nothing during render when the mode resolves locally', async () => {
	const atRender: number[] = [];
	const atMount: number[] = [];
	const view = await render(
		<ConsentProvider
			options={{ mode: registeredMode(false), persistence: false }}
		>
			<Timing
				atMount={atMount}
				atRender={atRender}
			/>
		</ConsentProvider>
	);
	expect(atRender[0]).toBe(0);
	await view.unmount();
});

test('sends nothing during render for a returning visitor', async () => {
	const earlier = createConsentKernel({
		...policyFixture({}, { id: 'earlier' }),
		consentCategories: ['measurement'],
	});
	const persistence = createPersistence({ kernel: earlier });
	await earlier.commands.save('all');
	await vi.waitFor(() => expect(document.cookie).toMatch(/(?:^|; )c15t=/u));
	try {
		const atRender: number[] = [];
		const atMount: number[] = [];
		const view = await render(
			<ConsentProvider options={{ mode: registeredMode(true) }}>
				<Timing
					atMount={atMount}
					atRender={atRender}
				/>
			</ConsentProvider>
		);
		expect(atRender[0]).toBe(0);
		await view.unmount();
	} finally {
		persistence.clear();
		persistence.dispose();
		earlier.dispose();
	}
});

test('an unmount before the answer leaves nothing for the next provider', async () => {
	const onError = vi.fn();
	const first = await render(
		<ConsentProvider
			options={{
				callbacks: { onError },
				mode: registeredMode(true),
				persistence: false,
			}}
		>
			<PolicyProbe />
		</ConsentProvider>
	);
	expect(initCalls()).toHaveLength(1);
	await first.unmount();
	respond[0]?.('late');

	delete (window as Window & { __c15tJourney?: unknown }).__c15tJourney;
	const second = await render(
		<ConsentProvider
			options={{ mode: registeredMode(true), persistence: false }}
		>
			<PolicyProbe />
		</ConsentProvider>
	);
	expect(initCalls()).toHaveLength(2);
	respond[1]?.('fresh');
	await expect.element(second.getByTestId('policy')).toHaveTextContent('fresh');
	expect(onError).not.toHaveBeenCalled();
	await second.unmount();
});
