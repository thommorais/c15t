import type * as Core from '@c15t/core';
import type { RevocationReloadOptions } from '@c15t/core';
import { vi } from 'vitest';

import { mockGVL } from './components/iab/__tests__/fixtures/mock-consent-state';

// oxlint-disable-next-line anti-slop/no-module-mocking -- `window.location.reload` cannot be replaced in a real browser. The factory returns the real module with only the reload swapped.
vi.mock('@c15t/core', async (importOriginal) => {
	const actual = await importOriginal<typeof Core>();
	return {
		...actual,
		watchRevocationReload: (options: RevocationReloadOptions) =>
			actual.watchRevocationReload({ reload: () => undefined, ...options }),
	};
});

if (typeof window !== 'undefined') {
	(window as unknown as { __c15t_mock_gvl?: typeof mockGVL }).__c15t_mock_gvl =
		mockGVL;

	console.log('[test-setup.browser] Mock GVL set on window');
}

await import('../../core/src/modules/persistence/writer/writer');
