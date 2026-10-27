import { createRoot } from 'react-dom/client';
import { expect, test, vi } from 'vitest';

import { ConsentDialog } from '../aggregate-components';
import { ConsentBanner } from '../components/prompt';
import { useSetActiveUI } from '../hooks';
import { ConsentProvider } from '../provider';
import { offline } from '../transports/offline';
import { policyFixture } from './policy-fixture';

const Controls = () => {
	const setActiveUI = useSetActiveUI();
	return (
		<button
			id="reopen"
			onClick={() => setActiveUI('dialog')}
			type="button"
		>
			Reopen
		</button>
	);
};

test('reveals a cold aggregate dialog as soon as its module is ready', async () => {
	const container = document.createElement('div');
	document.body.append(container);
	const root = createRoot(container);
	const dialog = () =>
		document.querySelector('[data-testid="consent-dialog-root"]');
	try {
		root.render(
			<ConsentProvider
				options={{
					mode: offline({ acknowledgeNoRecords: true }),
					persistence: false,
					prefetch: policyFixture(),
				}}
			>
				<ConsentBanner disableAnimation />
				<ConsentDialog disableAnimation />
				<Controls />
			</ConsentProvider>
		);
		await vi.waitFor(() =>
			expect(
				document.querySelector(
					'[data-testid="consent-banner-customize-button"]'
				)
			).not.toBeNull()
		);
		expect(dialog()).toBeNull();
		const customize = document.querySelector<HTMLButtonElement>(
			'[data-testid="consent-banner-customize-button"]'
		);
		customize?.click();
		await import('../components/panel');
		await new Promise(requestAnimationFrame);
		await new Promise(requestAnimationFrame);
		expect(dialog()).not.toBeNull();
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
		await vi.waitFor(() => expect(dialog()).toBeNull());
		container.querySelector<HTMLButtonElement>('#reopen')?.click();
		await new Promise(requestAnimationFrame);
		expect(dialog()).not.toBeNull();
	} finally {
		root.unmount();
		container.remove();
	}
});
