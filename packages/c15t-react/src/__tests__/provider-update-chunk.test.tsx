import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';

import { offline } from '../index';
import { ConsentProvider } from '../provider';
import { policyFixture } from './policy-fixture';

const updateModuleRequests = () =>
	performance
		.getEntriesByType('resource')
		.filter(({ name }) => name.includes('/c15t-core/src/runtime/provider-update'));

test('a rerender with the same option values loads no update module', async () => {
	performance.setResourceTimingBufferSize(5000);
	performance.clearResourceTimings();
	const mode = offline({ acknowledgeNoRecords: true });
	const prefetch = policyFixture();
	const first = { externalId: 'user_1' };
	const provider = (user: { externalId: string }) => (
		<ConsentProvider options={{ mode, persistence: false, prefetch, user }}>
			<span>child</span>
		</ConsentProvider>
	);
	const screen = await render(provider(first));
	await screen.rerender(provider(first));
	await screen.rerender(provider(first));
	await new Promise((resolve) => {
		setTimeout(resolve, 100);
	});

	expect(updateModuleRequests()).toHaveLength(0);

	await screen.rerender(provider({ externalId: 'user_2' }));
	await vi.waitFor(() => expect(updateModuleRequests()).toHaveLength(1));
});
