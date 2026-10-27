import type { Vendor } from '@c15t/core';
import { useEffect } from 'react';
import { describe, expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';

import { ComponentFixtureProvider as ConsentProvider } from '~/__tests__/component-fixture-provider';
import { policyFixture } from '~/__tests__/policy-fixture';
import { ConsentWidget } from '~/components/preferences';
import { useConsent, useVendorAllowed, useVendorChoice } from '~/hooks';
import { useKernel } from '~/kernel-selector';
import { offline } from '~/transports/offline';

const CATEGORIES = ['necessary', 'marketing', 'measurement'] as const;

const VENDORS: Vendor[] = [
	{
		category: 'marketing',
		description: 'Ad conversion measurement.',
		id: 'meta-pixel',
		name: 'Meta Pixel',
		privacyPolicyUrl: 'https://www.facebook.com/privacy/policy/',
	},
	{
		category: 'marketing',
		id: 'google-ads',
		name: 'Google Ads',
		privacyPolicyUrl: 'https://policies.google.com/privacy',
	},
	{
		category: 'measurement',
		id: 'google-analytics',
		name: 'Google Analytics',
		privacyPolicyUrl: 'https://policies.google.com/privacy',
	},
	{
		category: { or: ['marketing', 'measurement'] },
		id: 'shared-vendor',
		name: 'Shared Vendor',
		privacyPolicyUrl: 'https://example.com/privacy',
	},
	{
		category: { not: 'marketing' },
		id: 'negated-vendor',
		name: 'Negated Vendor',
		privacyPolicyUrl: 'https://example.com/privacy',
	},
	{
		category: 'marketing',
		disabled: true,
		id: 'fixed-vendor',
		name: 'Fixed Vendor',
		privacyPolicyUrl: 'https://example.com/privacy',
	},
];

const Probe = () => {
	const marketing = useConsent('marketing');
	const meta = useVendorAllowed('meta-pixel');
	const ads = useVendorAllowed('google-ads');
	const denied = useVendorChoice()?.denied ?? [];
	return (
		<output data-testid="probe">
			{JSON.stringify({ ads, denied, marketing, meta })}
		</output>
	);
};

const readProbe = () =>
	JSON.parse(
		document.querySelector('[data-testid="probe"]')?.textContent ?? '{}'
	) as { ads: boolean; denied: string[]; marketing: boolean; meta: boolean };

const openVendors = async (category: string) => {
	await page
		.getByTestId(`consent-widget-accordion-trigger-${category}`)
		.click();
};

const renderWidget = (
	values: Partial<Record<'marketing' | 'measurement', boolean>> = {}
) =>
	render(
		<ConsentProvider
			options={{
				consentCategories: [...CATEGORIES],
				mode: offline({ acknowledgeNoRecords: true }),
				persistence: false,
				prefetch: policyFixture(values, {
					categories: ['marketing', 'measurement'],
					id: 'vendor-rows',
					model: 'opt-in',
					prompt: 'choice',
				}),
				vendors: VENDORS,
			}}
		>
			<ConsentWidget />
			<Probe />
		</ConsentProvider>
	);

describe('consent widget vendor rows', () => {
	test('lists a category’s vendors and denies exactly the one turned off', async () => {
		renderWidget({ marketing: true, measurement: true });

		await openVendors('marketing');
		const list = page.getByTestId('consent-widget-vendor-list-marketing');
		await expect.element(list).toBeVisible();
		await expect.element(list).toHaveAccessibleName('Vendors (4)');
		const trigger = page.getByTestId(
			'consent-widget-vendor-trigger-marketing-meta-pixel'
		);
		await expect.element(trigger).toHaveTextContent('Meta Pixel');
		await expect
			.element(
				page.getByTestId('consent-widget-vendor-name-marketing-meta-pixel')
			)
			.toHaveTextContent('Meta Pixel');
		await expect.element(trigger).toHaveAttribute('aria-expanded', 'false');
		const content = page.getByTestId(
			'consent-widget-vendor-content-marketing-meta-pixel'
		);
		await expect.element(content).toHaveAttribute('aria-hidden', 'true');
		await trigger.click();
		await expect.element(trigger).toHaveAttribute('aria-expanded', 'true');
		await expect
			.element(content)
			.toHaveTextContent('Ad conversion measurement.');
		await expect.element(content).toHaveTextContent('Privacy policy');
		await openVendors('measurement');
		const marketingList = document.querySelector(
			'[data-testid="consent-widget-vendor-list-marketing"]'
		);
		expect(
			marketingList?.querySelector(
				'[data-testid="consent-widget-vendor-item-measurement-google-analytics"]'
			)
		).toBeNull();
		expect(
			document
				.querySelector('[data-testid="consent-widget-vendor-list-measurement"]')
				?.querySelector(
					'[data-testid="consent-widget-vendor-item-measurement-google-analytics"]'
				)
		).not.toBeNull();

		await openVendors('marketing');
		const meta = list.getByRole('switch', { name: 'Allow Meta Pixel' });
		await expect.element(meta).toHaveAttribute('aria-checked', 'true');
		await meta.click();
		await expect.element(meta).toHaveAttribute('aria-checked', 'false');
		expect(readProbe().meta).toBe(true);

		await page.getByTestId('consent-widget-footer-save-button').click();
		await vi.waitFor(() => {
			expect(readProbe()).toEqual({
				ads: true,
				denied: ['meta-pixel'],
				marketing: true,
				meta: false,
			});
		});
	});

	test('a collapsed category mounts its vendor rows on first open and keeps them', async () => {
		renderWidget({ marketing: true, measurement: true });
		const content = page.getByTestId(
			'consent-widget-accordion-content-marketing'
		);
		await expect.element(content).toHaveAttribute('data-state', 'closed');
		const trigger = page.getByTestId(
			'consent-widget-accordion-trigger-marketing'
		);
		await expect
			.element(trigger)
			.toHaveAttribute(
				'aria-controls',
				content.element().getAttribute('id') ?? ''
			);
		expect(
			document.querySelector('[data-testid^="consent-widget-vendor-"]')
		).toBeNull();

		await openVendors('marketing');
		const card = page.getByTestId(
			'consent-widget-vendor-item-marketing-meta-pixel'
		);
		await expect.element(card).toBeInTheDocument();
		const details = page.getByTestId(
			'consent-widget-vendor-content-marketing-meta-pixel'
		);
		await expect.element(details).toHaveAttribute('data-state', 'closed');
		expect(details.element().textContent).toBe('');
		await page
			.getByTestId('consent-widget-vendor-trigger-marketing-meta-pixel')
			.click();
		await expect
			.element(details)
			.toHaveTextContent('Ad conversion measurement.');

		await openVendors('measurement');
		await expect.element(content).toHaveAttribute('data-state', 'closed');
		await expect.element(card).toBeInTheDocument();
		await expect
			.element(details)
			.toHaveTextContent('Ad conversion measurement.');
	});

	test('vendor cards sit inset the same on both sides of the category row', async () => {
		renderWidget({ marketing: true, measurement: true });
		await openVendors('marketing');
		const item = document.querySelector(
			'[data-testid="consent-widget-accordion-item-marketing"]'
		);
		const card = document.querySelector(
			'[data-testid="consent-widget-vendor-item-marketing-meta-pixel"]'
		);
		expect(item).not.toBeNull();
		expect(card).not.toBeNull();
		if (!item || !card) {
			return;
		}
		const outer = item.getBoundingClientRect();
		const inner = card.getBoundingClientRect();
		expect(Math.round(inner.left - outer.left)).toBe(
			Math.round(outer.right - inner.right)
		);
	});

	test('disables vendor switches while the category is off and re-enables them', async () => {
		renderWidget({ marketing: false, measurement: true });
		await openVendors('marketing');
		const meta = page.getByTestId(
			'consent-widget-vendor-switch-marketing-meta-pixel'
		);
		await expect.element(meta).toBeDisabled();
		await expect
			.element(page.getByTestId('consent-widget-vendor-hint-marketing'))
			.toBeVisible();

		await page.getByTestId('consent-widget-switch-marketing').click();
		await expect.element(meta).toBeEnabled();
		expect(
			document.querySelector(
				'[data-testid="consent-widget-vendor-hint-marketing"]'
			)
		).toBeNull();
	});

	test('a shared vendor gets a distinct label id per category and a negated one is not listed', async () => {
		renderWidget({ marketing: true, measurement: true });
		await openVendors('marketing');
		await openVendors('measurement');
		await openVendors('marketing');
		const ids = [...document.querySelectorAll('[id$="-shared-vendor"]')].map(
			(element) => element.id
		);
		expect(new Set(ids).size).toBe(2);
		expect(ids.map((id) => id.replace(/^.*vendor-/u, '')).sort()).toEqual([
			'marketing-shared-vendor',
			'measurement-shared-vendor',
		]);
		const meta = document.querySelector(
			'[data-testid="consent-widget-vendor-switch-marketing-meta-pixel"]'
		);
		const described = meta?.getAttribute('aria-describedby');
		expect(described).toBeTruthy();
		expect(document.getElementById(described ?? '')?.textContent).toBe(
			'Meta Pixel'
		);
		expect(
			document.querySelector(
				'[data-testid="consent-widget-vendor-item-marketing-negated-vendor"]'
			)
		).toBeNull();
	});

	test('a disabled vendor is listed without a switch', async () => {
		renderWidget({ marketing: true, measurement: true });
		await openVendors('marketing');
		await expect
			.element(
				page.getByTestId('consent-widget-vendor-item-marketing-fixed-vendor')
			)
			.toHaveTextContent('Fixed Vendor');
		expect(
			document.querySelector(
				'[data-testid="consent-widget-vendor-switch-marketing-fixed-vendor"]'
			)
		).toBeNull();
	});

	test('accept all discards a staged vendor denial instead of recording it', async () => {
		renderWidget({ marketing: true, measurement: true });
		await openVendors('marketing');
		await page
			.getByTestId('consent-widget-vendor-switch-marketing-meta-pixel')
			.click();
		await page.getByTestId('consent-widget-footer-accept-all-button').click();
		await vi.waitFor(() => {
			expect(readProbe()).toEqual({
				ads: true,
				denied: [],
				marketing: true,
				meta: true,
			});
		});
	});

	test('accept all clears a recorded denial', async () => {
		renderWidget({ marketing: true, measurement: true });
		await openVendors('marketing');
		await page
			.getByTestId('consent-widget-vendor-switch-marketing-meta-pixel')
			.click();
		await page.getByTestId('consent-widget-footer-save-button').click();
		await vi.waitFor(() => {
			expect(readProbe().denied).toEqual(['meta-pixel']);
		});

		await page.getByTestId('consent-widget-footer-accept-all-button').click();
		await vi.waitFor(() => {
			expect(readProbe()).toEqual({
				ads: true,
				denied: [],
				marketing: true,
				meta: true,
			});
		});
	});
});

describe('vendor switches are opt-in', () => {
	const helperScript = {
		category: 'measurement' as const,
		id: 'posthog',
		src: 'https://example.invalid/posthog.js',
		vendor: 'posthog',
		vendorDetails: {
			name: 'PostHog',
			privacyPolicyUrl: 'https://posthog.com/privacy',
		},
	};

	const SavedHelperDenial = () => {
		const kernel = useKernel();
		useEffect(() => {
			void kernel.commands.save(
				{ marketing: false, measurement: true },
				{ vendors: { posthog: false } }
			);
		}, [kernel]);
		return <Probe />;
	};

	const renderWithHelper = (vendors?: Vendor[], savedDenial = false) =>
		render(
			<ConsentProvider
				options={{
					consentCategories: [...CATEGORIES],
					mode: offline({ acknowledgeNoRecords: true }),
					persistence: false,
					prefetch: policyFixture(
						{ measurement: true },
						{
							categories: ['marketing', 'measurement'],
							id: 'vendor-opt-in',
							model: 'opt-in',
							prompt: 'choice',
						}
					),
					scripts: [helperScript],
					vendors,
				}}
			>
				<ConsentWidget />
				{savedDenial ? <SavedHelperDenial /> : null}
			</ConsentProvider>
		);

	test('a helper alone shows its category without a vendor switch', async () => {
		renderWithHelper();
		await openVendors('measurement');
		await expect
			.element(page.getByTestId('consent-widget-accordion-content-measurement'))
			.toHaveAttribute('data-state', 'open');
		expect(
			document.querySelector(
				'[data-testid="consent-widget-vendor-list-measurement"]'
			)
		).toBeNull();
	});

	test('declaring a vendor lists helpers by name too', async () => {
		renderWithHelper([VENDORS[0] as Vendor]);
		await openVendors('measurement');
		await expect
			.element(page.getByTestId('consent-widget-vendor-list-measurement'))
			.toHaveTextContent('PostHog');
	});

	test('a saved helper denial remains editable without changing category choices', async () => {
		renderWithHelper(undefined, true);
		await vi.waitFor(() => expect(readProbe().denied).toEqual(['posthog']));
		await openVendors('measurement');
		const toggle = page.getByRole('switch', { name: 'Allow PostHog' });
		await expect.element(toggle).toHaveAttribute('aria-checked', 'false');
		await toggle.click();
		await expect.element(toggle).toHaveAttribute('aria-checked', 'true');
		expect(readProbe().denied).toEqual(['posthog']);
		await page.getByTestId('consent-widget-footer-save-button').click();
		await vi.waitFor(() => {
			expect(readProbe().denied).toEqual([]);
			expect(readProbe().marketing).toBe(false);
		});
	});
});
