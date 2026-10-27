import { useLayoutEffect } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';

import { ComponentFixtureProvider } from '~/__tests__/component-fixture-provider';
import { ConsentDevTools } from '~/devtools';
import { useDevToolsLauncherAvailable } from '~/devtools-launcher';
import { offline } from '~/transports/offline';

import { ConsentDialogTrigger } from '../index';

const LauncherProbe = ({ seen }: { seen: boolean[] }) => {
	const available = useDevToolsLauncherAvailable();
	useLayoutEffect(() => {
		if (available) {
			seen.push(document.querySelector('[role="toolbar"]') !== null);
		}
	}, [available, seen]);
	return null;
};

afterEach(() => {
	for (const host of document.querySelectorAll('[data-c15t-dev-tools-host]')) {
		host.remove();
	}
});

describe('ConsentDialogTrigger with ConsentDevTools', () => {
	test(
		'shows the toolbar in the same commit as the launcher',
		{ retry: 0 },
		async () => {
			const seen: boolean[] = [];
			await render(
				<ComponentFixtureProvider
					options={{ mode: offline({ acknowledgeNoRecords: true }) }}
				>
					<ConsentDevTools />
					<ConsentDialogTrigger showWhen="always" />
					<LauncherProbe seen={seen} />
				</ComponentFixtureProvider>
			);
			await vi.waitFor(() => {
				expect(seen).not.toEqual([]);
			});
			expect(seen[0]).toBe(true);
		}
	);
});
