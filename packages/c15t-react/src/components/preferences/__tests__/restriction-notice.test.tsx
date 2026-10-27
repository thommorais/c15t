import { describe, expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';

import { ComponentFixtureProvider as ConsentProvider } from '~/__tests__/component-fixture-provider';
import { policyFixture } from '~/__tests__/policy-fixture';
import { ConsentWidget } from '~/components/preferences';
import { offline } from '~/transports/offline';

const CATEGORIES = [
	'necessary',
	'functionality',
	'experience',
	'marketing',
	'measurement',
] as const;

const restriction = (name: string) =>
	document.querySelector(`[data-testid="consent-widget-restriction-${name}"]`);

describe('consent widget restriction notice', () => {
	test('does not appear when a draft toggle is switched on before saving', async () => {
		render(
			<ConsentProvider
				options={{
					consentCategories: [...CATEGORIES],
					mode: offline({ acknowledgeNoRecords: true }),
					prefetch: policyFixture(undefined, {
						categories: [...CATEGORIES],
						id: 'draft-toggle',
						model: 'opt-in',
						prompt: 'choice',
					}),
				}}
			>
				<ConsentWidget />
			</ConsentProvider>
		);

		const experience = page.getByTestId('consent-widget-switch-experience');
		await expect.element(experience).toHaveAttribute('aria-checked', 'false');
		await experience.click();
		await expect.element(experience).toHaveAttribute('aria-checked', 'true');

		expect(restriction('experience')).toBeNull();
		await expect.element(experience).not.toHaveAttribute('aria-describedby');
	});

	test('appears below the row for a saved grant that GPC overrides', async () => {
		render(
			<ConsentProvider
				options={{
					consentCategories: [...CATEGORIES],
					mode: offline({ acknowledgeNoRecords: true }),
					overrides: { gpc: true },
					prefetch: policyFixture(
						{ marketing: true, measurement: true },
						{
							categories: [...CATEGORIES],
							id: 'gpc-restricted',
							model: 'opt-in',
							privacySignals: { gpc: { denyCategories: ['marketing'] } },
							prompt: 'choice',
						}
					),
				}}
			>
				<ConsentWidget />
			</ConsentProvider>
		);

		const notice = await vi.waitFor(() => {
			const element = restriction('marketing');
			expect(element).toBeInTheDocument();
			return element as HTMLElement;
		});
		expect(notice.textContent).toContain('restricted');

		const row = document.querySelector(
			'[data-testid="consent-widget-accordion-trigger-marketing"]'
		);
		expect(row?.contains(notice)).toBe(false);

		const marketing = document.querySelector(
			'[data-testid="consent-widget-switch-marketing"]'
		);
		expect(marketing?.getAttribute('aria-describedby')).toBe(notice.id);

		expect(restriction('measurement')).toBeNull();
	});
});
