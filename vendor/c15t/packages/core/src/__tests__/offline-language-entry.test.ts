import { translations as italian } from '@c15t/translations/it';
import { describe, expect, test } from 'vitest';

import { offline } from '../index';
import { createConsentRuntime } from '../runtime';

describe('offline(): a language imported from its own entry', () => {
	test('switches the copy to that language and no other', async () => {
		const runtime = createConsentRuntime({
			mode: offline({ acknowledgeNoRecords: true }),
			persistence: false,
			windowDebug: false,
		});
		const { kernel } = runtime;
		await kernel.commands.init();

		kernel.set.language('it');
		await kernel.commands.init();
		expect(kernel.getSnapshot().translations?.language).toBe('it');
		expect(
			kernel.getSnapshot().translations?.translations.cookieBanner.title
		).toBe(italian.cookieBanner.title);

		kernel.set.language('es');
		await kernel.commands.init();
		expect(kernel.getSnapshot().translations?.language).toBe('en');
		runtime.dispose();
	});
});
