import type { Script, Vendor } from '@c15t/core';
import { useContext, useEffect, useState } from 'react';
import { describe, expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';

import { ComponentFixtureProvider as ConsentProvider } from '~/__tests__/component-fixture-provider';
import { policyFixture } from '~/__tests__/policy-fixture';
import { KernelContext, ProviderServicesContext } from '~/context';
import { useDeclaredVendors, useVendorAllowed } from '~/hooks';
import { useScriptLoader } from '~/module-hooks/script-loader';
import { offline } from '~/transports/offline';

const META: Vendor = {
	category: 'marketing',
	id: 'meta-pixel',
	name: 'Meta Pixel',
	privacyPolicyUrl: 'https://www.facebook.com/privacy/policy/',
};

const Probe = () => {
	const declared = useDeclaredVendors();
	const meta = useVendorAllowed('meta-pixel');
	return (
		<output data-testid="probe">
			{JSON.stringify({
				declared: declared.map((vendor) => vendor.id),
				meta,
				name: declared.find((vendor) => vendor.id === 'meta-pixel')?.name,
				ownerCategory: declared.find((vendor) => vendor.id === 'meta-pixel')
					?.ownerCategory,
				source: declared.find((vendor) => vendor.id === 'meta-pixel')?.source,
			})}
		</output>
	);
};

const readProbe = () =>
	JSON.parse(
		document.querySelector('[data-testid="probe"]')?.textContent ?? 'null'
	) as {
		declared: string[];
		meta: boolean;
		name?: string;
		ownerCategory?: unknown;
		source?: string;
	} | null;

describe('provider vendor options', () => {
	test('a vendors option supplied after the first render reaches the kernel', async () => {
		const Host = () => {
			const [vendors, setVendors] = useState<Vendor[]>([]);
			return (
				<ConsentProvider
					options={{
						consentCategories: ['necessary', 'marketing'],
						mode: offline({ acknowledgeNoRecords: true }),
						persistence: false,
						prefetch: policyFixture(
							{ marketing: true },
							{ categories: ['marketing'], id: 'late-vendors' }
						),
						vendors,
					}}
				>
					<button
						data-testid="declare"
						onClick={() => setVendors([META])}
						type="button"
					>
						declare
					</button>
					<Probe />
				</ConsentProvider>
			);
		};
		render(<Host />);
		await vi.waitFor(() => {
			expect(readProbe()?.declared).toEqual([]);
		});
		await page.getByTestId('declare').click();
		await vi.waitFor(() => {
			expect(readProbe()?.declared).toEqual(['meta-pixel']);
		});
	});

	test('a vendor removed from the option disappears from the kernel', async () => {
		const Host = () => {
			const [vendors, setVendors] = useState<Vendor[]>([META]);
			return (
				<ConsentProvider
					options={{
						consentCategories: ['necessary', 'marketing'],
						mode: offline({ acknowledgeNoRecords: true }),
						persistence: false,
						prefetch: policyFixture(
							{ marketing: true },
							{ categories: ['marketing'], id: 'removed-vendors' }
						),
						vendors,
					}}
				>
					<button
						data-testid="remove"
						onClick={() => setVendors([])}
						type="button"
					>
						remove
					</button>
					<Probe />
				</ConsentProvider>
			);
		};
		render(<Host />);
		await vi.waitFor(() => {
			expect(readProbe()?.declared).toEqual(['meta-pixel']);
		});
		await page.getByTestId('remove').click();
		await vi.waitFor(() => {
			expect(readProbe()?.declared).toEqual([]);
		});
	});

	test('a removed vendor that a script still names falls back to a script entry', async () => {
		const Host = () => {
			const [vendors, setVendors] = useState<Vendor[]>([META]);
			return (
				<ConsentProvider
					options={{
						consentCategories: ['necessary', 'marketing'],
						mode: offline({ acknowledgeNoRecords: true }),
						persistence: false,
						prefetch: policyFixture(
							{ marketing: true },
							{ categories: ['marketing'], id: 'owned-vendors' }
						),
						scripts: [
							{
								category: 'marketing',
								id: 'meta-pixel-script',
								textContent: '/* pixel */',
								vendor: 'meta-pixel',
							},
						],
						vendors,
					}}
				>
					<button
						data-testid="remove"
						onClick={() => setVendors([])}
						type="button"
					>
						remove
					</button>
					<Probe />
				</ConsentProvider>
			);
		};
		render(<Host />);
		await vi.waitFor(() => {
			expect(readProbe()?.declared).toEqual(['meta-pixel']);
		});
		await page.getByTestId('remove').click();
		await vi.waitFor(() => {
			expect(readProbe()?.source).toBe('script');
		});
	});

	test('a script added later declares its vendor slug', async () => {
		const Host = () => {
			const [scripts, setScripts] = useState<Script[]>([]);
			return (
				<ConsentProvider
					options={{
						consentCategories: ['necessary', 'marketing'],
						mode: offline({ acknowledgeNoRecords: true }),
						persistence: false,
						prefetch: policyFixture(
							{ marketing: true },
							{ categories: ['marketing'], id: 'late-scripts' }
						),
						scripts,
					}}
				>
					<button
						data-testid="add-script"
						onClick={() =>
							setScripts([
								{
									category: 'marketing',
									id: 'meta-pixel-script',
									textContent: '/* pixel */',
									vendor: 'meta-pixel',
								},
							])
						}
						type="button"
					>
						add
					</button>
					<Probe />
				</ConsentProvider>
			);
		};
		render(<Host />);
		await vi.waitFor(() => {
			expect(readProbe()?.declared).toEqual([]);
		});
		await page.getByTestId('add-script').click();
		await vi.waitFor(() => {
			expect(readProbe()?.source).toBe('script');
		});
	});

	test('a removed script takes its slug-only vendor with it', async () => {
		const pixel: Script = {
			category: 'marketing',
			id: 'meta-pixel-script',
			textContent: '/* pixel */',
			vendor: 'meta-pixel',
		};
		const Host = () => {
			const [scripts, setScripts] = useState<Script[]>([pixel]);
			return (
				<ConsentProvider
					options={{
						consentCategories: ['necessary', 'marketing'],
						mode: offline({ acknowledgeNoRecords: true }),
						persistence: false,
						prefetch: policyFixture(
							{ marketing: true },
							{ categories: ['marketing'], id: 'removed-scripts' }
						),
						scripts,
					}}
				>
					<button
						data-testid="remove-script"
						onClick={() => setScripts([])}
						type="button"
					>
						remove
					</button>
					<Probe />
				</ConsentProvider>
			);
		};
		render(<Host />);
		await vi.waitFor(() => {
			expect(readProbe()?.source).toBe('script');
		});
		await page.getByTestId('remove-script').click();
		await vi.waitFor(() => {
			expect(readProbe()?.declared).toEqual([]);
		});
	});

	test('removing a config vendor restores the backend copy it shadowed', async () => {
		const fixture = policyFixture(
			{ marketing: true },
			{ categories: ['marketing'], id: 'shadowed-vendors' }
		);
		const Host = () => {
			const [vendors, setVendors] = useState<Vendor[]>([
				{ ...META, name: 'Meta (config)' },
			]);
			return (
				<ConsentProvider
					options={{
						consentCategories: ['necessary', 'marketing'],
						mode: offline({ acknowledgeNoRecords: true }),
						persistence: false,
						prefetch: {
							...fixture,
							initialVendors: {
								declared: [
									{
										...META,
										name: 'Meta (backend)',
										presentable: true,
										source: 'manifest',
									},
								],
								listVersion: '1',
							},
						},
						vendors,
					}}
				>
					<button
						data-testid="remove"
						onClick={() => setVendors([])}
						type="button"
					>
						remove
					</button>
					<Probe />
				</ConsentProvider>
			);
		};
		render(<Host />);
		await vi.waitFor(() => {
			expect(readProbe()?.name).toBe('Meta (config)');
		});
		await page.getByTestId('remove').click();
		await vi.waitFor(() => {
			expect(readProbe()?.source).toBe('manifest');
			expect(readProbe()?.name).toBe('Meta (backend)');
		});
	});

	test('a script that starts naming a backend vendor becomes its owner', async () => {
		const fixture = policyFixture(
			{ marketing: true },
			{ categories: ['marketing'], id: 'owned-backend-vendor' }
		);
		const Host = () => {
			const [scripts, setScripts] = useState<Script[]>([]);
			return (
				<ConsentProvider
					options={{
						consentCategories: ['necessary', 'marketing'],
						mode: offline({ acknowledgeNoRecords: true }),
						persistence: false,
						prefetch: {
							...fixture,
							initialVendors: {
								declared: [{ ...META, presentable: true, source: 'manifest' }],
								listVersion: '1',
							},
						},
						scripts,
					}}
				>
					<button
						data-testid="add-script"
						onClick={() =>
							setScripts([
								{
									category: 'marketing',
									id: 'meta-pixel-script',
									textContent: '/* pixel */',
									vendor: 'meta-pixel',
								},
							])
						}
						type="button"
					>
						add
					</button>
					<Probe />
				</ConsentProvider>
			);
		};
		render(<Host />);
		await vi.waitFor(() => {
			expect(readProbe()?.source).toBe('manifest');
		});
		await page.getByTestId('add-script').click();
		await vi.waitFor(() => {
			expect(readProbe()?.ownerCategory).toBe('marketing');
		});
		expect(readProbe()?.source).toBe('manifest');
	});

	test('a backend vendor forgets a script owner the parent removed', async () => {
		const fixture = policyFixture(
			{ marketing: true },
			{ categories: ['marketing'], id: 'forgotten-owner' }
		);
		const pixel: Script = {
			category: 'marketing',
			id: 'meta-pixel-script',
			textContent: '/* pixel */',
			vendor: 'meta-pixel',
		};
		const Host = () => {
			const [scripts, setScripts] = useState<Script[]>([pixel]);
			return (
				<ConsentProvider
					options={{
						consentCategories: ['necessary', 'marketing'],
						mode: offline({ acknowledgeNoRecords: true }),
						persistence: false,
						prefetch: {
							...fixture,
							initialVendors: {
								declared: [{ ...META, presentable: true, source: 'manifest' }],
								listVersion: '1',
							},
						},
						scripts,
					}}
				>
					<button
						data-testid="remove-script"
						onClick={() => setScripts([])}
						type="button"
					>
						remove
					</button>
					<Probe />
				</ConsentProvider>
			);
		};
		render(<Host />);
		await vi.waitFor(() => {
			expect(readProbe()?.ownerCategory).toBe('marketing');
		});
		await page.getByTestId('remove-script').click();
		await vi.waitFor(() => {
			expect(readProbe()?.ownerCategory).toBeUndefined();
		});
		expect(readProbe()?.source).toBe('manifest');
	});

	test('a shadowed backend copy forgets a script owner the parent removed', async () => {
		const fixture = policyFixture(
			{ marketing: true },
			{ categories: ['marketing'], id: 'shadowed-owner' }
		);
		const pixel: Script = {
			category: 'marketing',
			id: 'meta-pixel-script',
			textContent: '/* pixel */',
			vendor: 'meta-pixel',
		};
		const Host = () => {
			const [scripts, setScripts] = useState<Script[]>([pixel]);
			const [vendors, setVendors] = useState<Vendor[]>([
				{ ...META, name: 'Meta (config)' },
			]);
			return (
				<ConsentProvider
					options={{
						consentCategories: ['necessary', 'marketing'],
						mode: offline({ acknowledgeNoRecords: true }),
						persistence: false,
						prefetch: {
							...fixture,
							initialVendors: {
								declared: [
									{
										...META,
										name: 'Meta (backend)',
										presentable: true,
										source: 'manifest',
									},
								],
								listVersion: '1',
							},
						},
						scripts,
						vendors,
					}}
				>
					<button
						data-testid="remove-script"
						onClick={() => setScripts([])}
						type="button"
					>
						remove script
					</button>
					<button
						data-testid="remove-config"
						onClick={() => setVendors([])}
						type="button"
					>
						remove config
					</button>
					<Probe />
				</ConsentProvider>
			);
		};
		render(<Host />);
		await vi.waitFor(() => {
			expect(readProbe()?.name).toBe('Meta (config)');
		});
		await page.getByTestId('remove-script').click();
		await page.getByTestId('remove-config').click();
		await vi.waitFor(() => {
			expect(readProbe()?.source).toBe('manifest');
		});
		expect(readProbe()?.ownerCategory).toBeUndefined();
	});

	test('a vendor option update keeps a slug another module declared', async () => {
		const fixture = policyFixture(
			{ marketing: true },
			{ categories: ['marketing'], id: 'hook-owned-vendor' }
		);
		const HookLoader = () => {
			useScriptLoader([
				{
					callbackOnly: true,
					category: 'marketing',
					id: 'hook-pixel',
					vendor: 'hook-vendor',
				},
			]);
			return null;
		};
		const Host = () => {
			const [vendors, setVendors] = useState<Vendor[]>([]);
			return (
				<ConsentProvider
					options={{
						consentCategories: ['necessary', 'marketing'],
						mode: offline({ acknowledgeNoRecords: true }),
						persistence: false,
						prefetch: fixture,
						vendors,
					}}
				>
					<HookLoader />
					<button
						data-testid="declare"
						onClick={() => setVendors([{ ...META, id: 'other-vendor' }])}
						type="button"
					>
						declare
					</button>
					<Probe />
				</ConsentProvider>
			);
		};
		render(<Host />);
		await vi.waitFor(() => {
			expect(readProbe()?.declared).toEqual(['hook-vendor']);
		});
		await page.getByTestId('declare').click();
		await vi.waitFor(() => {
			expect(readProbe()?.declared).toEqual(['hook-vendor', 'other-vendor']);
		});
	});

	test('a hook-owned slug the provider also declared survives the provider dropping it', async () => {
		const fixture = policyFixture(
			{ marketing: true },
			{ categories: ['marketing'], id: 'shadowed-hook-vendor' }
		);
		const HookLoader = () => {
			useScriptLoader([
				{
					callbackOnly: true,
					category: 'marketing',
					id: 'hook-meta',
					vendor: 'meta-pixel',
				},
			]);
			return null;
		};
		const Host = () => {
			const [vendors, setVendors] = useState<Vendor[]>([META]);
			return (
				<ConsentProvider
					options={{
						consentCategories: ['necessary', 'marketing'],
						mode: offline({ acknowledgeNoRecords: true }),
						persistence: false,
						prefetch: fixture,
						vendors,
					}}
				>
					<HookLoader />
					<button
						data-testid="remove"
						onClick={() => setVendors([])}
						type="button"
					>
						remove
					</button>
					<Probe />
				</ConsentProvider>
			);
		};
		render(<Host />);
		await vi.waitFor(() => {
			expect(readProbe()?.source).toBe('config');
		});
		await page.getByTestId('remove').click();
		await vi.waitFor(() => {
			expect(readProbe()?.declared).toEqual(['meta-pixel']);
			expect(readProbe()?.source).toBe('script');
		});
	});

	test('the provider clear fallback lifts a stored vendor denial', async () => {
		const fixture = policyFixture(
			{ marketing: true },
			{ categories: ['marketing'], id: 'clear-vendors' }
		);
		const Clear = () => {
			const services = useContext(ProviderServicesContext);
			const kernel = useContext(KernelContext);
			const [denied, setDenied] = useState<string>('unread');
			useEffect(
				() =>
					kernel?.subscribe((snapshot) => {
						setDenied(JSON.stringify(snapshot.vendorChoice?.denied ?? null));
					}),
				[kernel]
			);
			return (
				<>
					<output data-testid="denied">{denied}</output>
					<button
						data-testid="clear"
						onClick={() => services?.clearRecords()}
						type="button"
					>
						clear
					</button>
				</>
			);
		};
		render(
			<ConsentProvider
				options={{
					consentCategories: ['necessary', 'marketing'],
					mode: offline({ acknowledgeNoRecords: true }),
					persistence: false,
					prefetch: {
						...fixture,
						initialRecords: {
							...fixture.initialRecords,
							vendorChoice: {
								confirmedAt: fixture.now ?? Date.now(),
								denied: ['meta-pixel'],
								version: 1,
							},
						},
					},
					vendors: [META],
				}}
			>
				<Clear />
				<Probe />
			</ConsentProvider>
		);
		const denied = () =>
			document.querySelector('[data-testid="denied"]')?.textContent;
		await vi.waitFor(() => {
			expect(readProbe()?.meta).toBe(false);
		});
		await page.getByTestId('clear').click();
		await vi.waitFor(() => {
			expect(denied()).toBe('null');
		});
	});

	test('a provider update keeps the category a hook names a shared slug under', async () => {
		const fixture = policyFixture(
			{ marketing: false, measurement: true },
			{ categories: ['marketing', 'measurement'], id: 'shared-slug-hook' }
		);
		const HookLoader = () => {
			useScriptLoader([
				{
					callbackOnly: true,
					category: 'measurement',
					id: 'hook-ga',
					vendor: 'ga',
				},
			]);
			return null;
		};
		const CategoryProbe = () => {
			const declared = useDeclaredVendors();
			const allowed = useVendorAllowed('ga');
			return (
				<output data-testid="category">
					{JSON.stringify({
						allowed,
						category: declared.find((vendor) => vendor.id === 'ga')?.category,
					})}
				</output>
			);
		};
		const Host = () => {
			const [vendors, setVendors] = useState<Vendor[]>([]);
			return (
				<ConsentProvider
					options={{
						consentCategories: ['necessary', 'marketing', 'measurement'],
						mode: offline({ acknowledgeNoRecords: true }),
						persistence: false,
						prefetch: fixture,
						scripts: [
							{
								callbackOnly: true,
								category: 'marketing',
								id: 'provider-ga',
								vendor: 'ga',
							},
						],
						vendors,
					}}
				>
					<HookLoader />
					<button
						data-testid="declare"
						onClick={() => setVendors([{ ...META, id: 'other-vendor' }])}
						type="button"
					>
						declare
					</button>
					<CategoryProbe />
				</ConsentProvider>
			);
		};
		const read = () =>
			JSON.parse(
				document.querySelector('[data-testid="category"]')?.textContent ??
					'null'
			) as { allowed: boolean; category?: unknown } | null;
		render(<Host />);
		await vi.waitFor(() => {
			expect(read()?.allowed).toBe(true);
		});
		await page.getByTestId('declare').click();
		await vi.waitFor(() => {
			expect(read()?.category).toEqual({ or: ['marketing', 'measurement'] });
		});
		expect(read()?.allowed).toBe(true);
	});

	test('useVendorAllowed reads a vendor removed from the declarations as not allowed', async () => {
		const fixture = policyFixture(
			{ marketing: true },
			{ categories: ['marketing'], id: 'removed-denied-vendor' }
		);
		const Host = () => {
			const [vendors, setVendors] = useState<Vendor[]>([META]);
			return (
				<ConsentProvider
					options={{
						consentCategories: ['necessary', 'marketing'],
						mode: offline({ acknowledgeNoRecords: true }),
						persistence: false,
						prefetch: {
							...fixture,
							initialRecords: {
								...fixture.initialRecords,
								vendorChoice: {
									confirmedAt: (fixture.now ?? 1) - 1,
									denied: ['meta-pixel'],
									version: 1,
								},
							},
						},
						vendors,
					}}
				>
					<button
						data-testid="remove"
						onClick={() => setVendors([])}
						type="button"
					>
						remove
					</button>
					<Probe />
				</ConsentProvider>
			);
		};
		render(<Host />);
		await vi.waitFor(() => {
			expect(readProbe()?.meta).toBe(false);
		});
		await page.getByTestId('remove').click();
		await vi.waitFor(() => {
			expect(readProbe()?.declared).toEqual([]);
		});
		expect(readProbe()?.meta).toBe(false);
	});

	test('useVendorAllowed reads an undeclared vendor as not allowed while its category is granted', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		const fixture = policyFixture(
			{ marketing: true },
			{ categories: ['marketing'], id: 'undeclared-vendor' }
		);
		const Typo = () => {
			const allowed = useVendorAllowed('meta-pixle');
			return <output data-testid="typo">{String(allowed)}</output>;
		};
		render(
			<ConsentProvider
				options={{
					consentCategories: ['necessary', 'marketing'],
					mode: offline({ acknowledgeNoRecords: true }),
					persistence: false,
					prefetch: fixture,
					vendors: [META],
				}}
			>
				<Typo />
				<Probe />
			</ConsentProvider>
		);
		await vi.waitFor(() => {
			expect(readProbe()?.meta).toBe(true);
		});
		expect(document.querySelector('[data-testid="typo"]')?.textContent).toBe(
			'false'
		);
		expect(warn).toHaveBeenCalledWith(
			expect.stringContaining('"meta-pixle" is not declared')
		);
		warn.mockRestore();
	});

	test('useVendorAllowed ignores a stored denial for a vendor declared disabled', async () => {
		const fixture = policyFixture(
			{ marketing: true },
			{ categories: ['marketing'], id: 'disabled-vendor' }
		);
		render(
			<ConsentProvider
				options={{
					consentCategories: ['necessary', 'marketing'],
					mode: offline({ acknowledgeNoRecords: true }),
					persistence: false,
					prefetch: {
						...fixture,
						initialRecords: {
							...fixture.initialRecords,
							vendorChoice: {
								confirmedAt: (fixture.now ?? 1) - 1,
								denied: ['meta-pixel'],
								version: 1,
							},
						},
					},
					vendors: [{ ...META, disabled: true }],
				}}
			>
				<Probe />
			</ConsentProvider>
		);
		await vi.waitFor(() => {
			expect(readProbe()?.meta).toBe(true);
		});
	});
});
