import { afterEach, describe, expect, test, vi } from 'vitest';

import {
	choiceRecords,
	iabRule,
	matchedResolution,
	noneRule,
	NOW,
	optInRule,
} from '../../__tests__/fixtures/kernel-fixtures';
import type {
	ConsentSnapshot,
	InitResponse,
	KernelConfig,
	KernelVendorsState,
	ResolvedVendor,
	SavePayload,
	KernelTransport,
} from '../../types';
import { createKernel as assembleKernel } from '../index';
import { validateVendorChoice } from '../record-validation';
import { createMemoryOutboxStore } from '../save-outbox';
import type { SaveOutboxStore } from '../save-outbox';

afterEach(() => {
	vi.restoreAllMocks();
});

const vendors: KernelVendorsState = {
	declared: [
		{
			category: 'marketing',
			id: 'meta-pixel',
			name: 'Meta Pixel',
			presentable: true,
			privacyPolicyUrl: 'https://www.facebook.com/privacy/policy/',
			source: 'config',
		},
		{
			category: 'measurement',
			id: 'google-analytics',
			name: 'Google Analytics',
			presentable: true,
			privacyPolicyUrl: 'https://policies.google.com/privacy',
			source: 'config',
		},
		{
			category: 'necessary',
			disabled: true,
			id: 'cdn',
			name: 'CDN',
			presentable: true,
			privacyPolicyUrl: 'https://cdn.example/privacy',
			source: 'config',
		},
	],
	listVersion: '2026-09',
};

const createKernel = function createKernel(
	overrides: KernelConfig = {},
	outboxStore: SaveOutboxStore = createMemoryOutboxStore()
) {
	vi.spyOn(Date, 'now').mockReturnValue(NOW);
	return assembleKernel(
		{
			initialPolicyResolution: matchedResolution(
				optInRule({ categories: ['marketing', 'measurement'] })
			),
			initialVendors: vendors,
			now: NOW,
			...overrides,
		},
		{ outboxStore }
	);
};

describe('validateVendorChoice', () => {
	test('accepts, dedupes and sorts a denial list', () => {
		expect(
			validateVendorChoice(
				{ confirmedAt: NOW - 1, denied: ['b', 'a', 'b'], version: 1 },
				NOW
			)
		).toEqual({
			ok: true,
			record: { confirmedAt: NOW - 1, denied: ['a', 'b'], version: 1 },
		});
	});

	test.each([
		['future time', { confirmedAt: NOW + 1, denied: [], version: 1 }],
		['unknown version', { confirmedAt: NOW, denied: [], version: 2 }],
		['unknown key', { confirmedAt: NOW, denied: [], extra: 1, version: 1 }],
		['empty id', { confirmedAt: NOW, denied: [''], version: 1 }],
		['non-slug id', { confirmedAt: NOW, denied: ['Bad ID'], version: 1 }],
		['non-array', { confirmedAt: NOW, denied: 'a', version: 1 }],
	])('rejects %s', (_label, input) => {
		expect(validateVendorChoice(input, NOW).ok).toBe(false);
	});
});

describe('snapshot vendor state', () => {
	test('an empty declared list still keeps its version', () => {
		const snap = assembleKernel({
			initialVendors: { declared: [], listVersion: '2026-09' },
			now: NOW,
		}).getSnapshot();
		expect(snap.vendors).toEqual({ declared: [], listVersion: '2026-09' });
	});

	test('construction copies declared vendors and seeds no denial', () => {
		const snap = assembleKernel({
			initialVendors: vendors,
			now: NOW,
		}).getSnapshot();
		expect(snap.vendors?.declared).toHaveLength(3);
		expect(snap.vendors?.listVersion).toBe('2026-09');
		expect(snap.vendorChoice).toBeNull();
		expect(Object.isFrozen(snap.vendors)).toBe(true);
		expect(Object.isFrozen(snap.vendors?.declared)).toBe(true);
	});

	test('hydration applies a stored denial list without a choice event', () => {
		const kernel = createKernel();
		const recorded = vi.fn();
		kernel.events.on('vendors:recorded', recorded);
		const result = kernel.hydrate({
			now: NOW,
			vendorChoice: {
				confirmedAt: NOW - 5,
				denied: ['meta-pixel'],
				version: 1,
			},
		});
		expect(result).toEqual({ changed: true, ok: true });
		expect(kernel.getSnapshot().vendorChoice?.denied).toEqual(['meta-pixel']);
		expect(Object.isFrozen(kernel.getSnapshot().vendorChoice)).toBe(true);
		expect(recorded).not.toHaveBeenCalled();
		kernel.dispose();
	});

	test('a malformed stored denial list rejects the whole hydration', () => {
		const kernel = createKernel();
		const result = kernel.hydrate({
			now: NOW,
			vendorChoice: { confirmedAt: NOW + 1, denied: [], version: 1 },
		});
		expect(result.ok).toBe(false);
		expect(kernel.getSnapshot().vendorChoice).toBeNull();
		kernel.dispose();
	});

	test('set.vendors with replaceSource drops that source\u2019s previous entries', () => {
		const kernel = createKernel();
		kernel.set.vendors(
			{
				declared: [
					{
						category: 'marketing',
						id: 'meta-pixel',
						name: 'Meta Pixel',
						presentable: true,
						privacyPolicyUrl: 'https://www.facebook.com/privacy/policy/',
						source: 'config',
					},
				],
			},
			{ replaceSource: 'config' }
		);
		expect(
			kernel.getSnapshot().vendors?.declared.map((vendor) => vendor.id)
		).toEqual(['meta-pixel']);
		kernel.set.vendors({ declared: [] }, { replaceSource: 'config' });
		expect(kernel.getSnapshot().vendors).toEqual({
			declared: [],
			listVersion: '2026-09',
		});
		kernel.dispose();
	});

	test('replacing the config source restores the backend copy a config entry shadowed', () => {
		const kernel = createKernel({ initialVendors: undefined });
		kernel.set.vendors({
			declared: [
				{
					category: 'marketing',
					id: 'meta-pixel',
					name: 'Meta (backend)',
					presentable: true,
					privacyPolicyUrl: 'https://example.com/backend',
					source: 'manifest',
				},
			],
		});
		kernel.set.vendors(
			{ declared: [vendors.declared[0] as ResolvedVendor] },
			{ replaceSource: 'config' }
		);
		expect(kernel.getSnapshot().vendors?.declared[0]?.name).toBe('Meta Pixel');
		kernel.set.vendors({ declared: [] }, { replaceSource: 'config' });
		const [restored] = kernel.getSnapshot().vendors?.declared ?? [];
		expect(restored?.source).toBe('manifest');
		expect(restored?.name).toBe('Meta (backend)');
		kernel.dispose();
	});

	test('set.vendors with replaceSource and the same list is a no-op', () => {
		const kernel = createKernel();
		const set = vi.fn();
		kernel.events.on('vendors:set', set);
		const before = kernel.getSnapshot();
		kernel.set.vendors(
			{ declared: vendors.declared },
			{ replaceSource: 'config' }
		);
		expect(set).not.toHaveBeenCalled();
		expect(kernel.getSnapshot().vendors).toBe(before.vendors);
		kernel.dispose();
	});

	test('set.vendors merges declarations and emits once per change', () => {
		const kernel = createKernel({ initialVendors: undefined });
		const set = vi.fn();
		kernel.events.on('vendors:set', set);
		kernel.set.vendors({ declared: vendors.declared });
		kernel.set.vendors({ declared: vendors.declared });
		expect(set).toHaveBeenCalledOnce();
		expect(kernel.getSnapshot().vendors?.declared).toHaveLength(3);
		kernel.dispose();
	});
});

describe('save with vendors', () => {
	test('a vendor-only save records, persists an event and sends the grant map', async () => {
		const save = vi.fn<NonNullable<KernelTransport['save']>>(() =>
			Promise.resolve({ ok: true })
		);
		const kernel = createKernel({
			initialRecords: choiceRecords({ marketing: true, measurement: true }),
			transport: { save },
		});
		const choice = vi.fn();
		const recorded = vi.fn();
		kernel.events.on('choice:recorded', choice);
		kernel.events.on('vendors:recorded', recorded);
		const before = kernel.getSnapshot();

		const result = await kernel.commands.save(
			{},
			{
				vendors: { 'meta-pixel': false },
			}
		);
		expect(result.ok).toBe(true);
		expect(result.confirmed).toEqual([]);
		const after = kernel.getSnapshot();
		expect(after.vendorChoice).toEqual({
			confirmedAt: NOW,
			denied: ['meta-pixel'],
			version: 1,
		});
		expect(after.explicitChoice).toBe(before.explicitChoice);
		expect(choice).not.toHaveBeenCalled();
		expect(recorded).toHaveBeenCalledOnce();
		expect(save).toHaveBeenCalledOnce();
		const payload = save.mock.calls[0]?.[0] as SavePayload;
		expect(payload.vendorChoice).toEqual({
			confirmedAt: NOW,
			grants: { cdn: true, 'google-analytics': true, 'meta-pixel': false },
			version: 1,
		});
		kernel.dispose();
	});

	test('an explicit reconfirmation of the same denials renews the confirmation time', async () => {
		const kernel = createKernel({
			initialRecords: {
				...choiceRecords({ marketing: true, measurement: true }),
				vendorChoice: {
					confirmedAt: NOW - 500,
					denied: ['meta-pixel'],
					version: 1,
				},
			},
		});
		const recorded = vi.fn();
		kernel.events.on('vendors:recorded', recorded);
		const result = await kernel.commands.save(
			{},
			{
				vendors: { 'meta-pixel': false },
			}
		);
		expect(result.confirmed).toEqual([]);
		expect(kernel.getSnapshot().vendorChoice).toEqual({
			confirmedAt: NOW,
			denied: ['meta-pixel'],
			version: 1,
		});
		expect(recorded).toHaveBeenCalledOnce();
		kernel.dispose();
	});

	test('undeclared and disabled vendor ids are ignored', async () => {
		const kernel = createKernel({
			initialRecords: choiceRecords({ marketing: true, measurement: true }),
		});
		await kernel.commands.save(
			{},
			{
				vendors: { cdn: false, unknown: false },
			}
		);
		expect(kernel.getSnapshot().vendorChoice).toBeNull();
		kernel.dispose();
	});

	test('an object input carries its vendor grants next to the categories', async () => {
		const kernel = createKernel({
			initialRecords: choiceRecords({ marketing: true, measurement: true }),
		});
		const result = await kernel.commands.save({
			marketing: true,
			vendors: { 'meta-pixel': false },
		});
		expect(result.ok).toBe(true);
		expect(kernel.getSnapshot().vendorChoice).toEqual({
			confirmedAt: NOW,
			denied: ['meta-pixel'],
			version: 1,
		});
		const categories = kernel.getSnapshot().explicitChoice?.categories ?? {};
		expect(categories.marketing?.value).toBe(true);
		expect(Object.keys(categories)).not.toContain('vendors');
		await kernel.commands.save(
			{ vendors: { 'meta-pixel': false } },
			{ vendors: { 'meta-pixel': true } }
		);
		expect(kernel.getSnapshot().vendorChoice?.denied).toEqual([]);
		const bad = await kernel.commands.save({
			vendors: { 'meta-pixel': 'no' as never },
		});
		expect(bad.ok).toBe(false);
		kernel.dispose();
	});

	test('malformed vendor input rejects the save before anything changes', async () => {
		const kernel = createKernel();
		const started = vi.fn();
		kernel.events.on('command:save:started', started);
		const result = await kernel.commands.save(
			{ marketing: true },
			{ vendors: { 'meta-pixel': 'no' as never } }
		);
		expect(result.ok).toBe(false);
		expect(started).not.toHaveBeenCalled();
		expect(kernel.getSnapshot().explicitChoice).toBeNull();
		kernel.dispose();
	});

	test('a bulk action ignores explicit vendor grants and stamps the clear', async () => {
		const kernel = createKernel({
			initialRecords: choiceRecords({ marketing: true, measurement: true }),
		});
		await kernel.commands.save('all', { vendors: { 'meta-pixel': false } });
		expect(kernel.getSnapshot().vendorChoice).toEqual({
			confirmedAt: NOW,
			denied: [],
			version: 1,
		});
		kernel.dispose();
	});

	test('a bulk action narrowed to some categories keeps unrelated denials', async () => {
		const kernel = createKernel({
			initialRecords: {
				...choiceRecords({ marketing: true, measurement: true }),
				vendorChoice: {
					confirmedAt: NOW - 500,
					denied: ['google-analytics', 'meta-pixel'],
					version: 1,
				},
			},
		});
		await kernel.commands.save('none', { categories: ['measurement'] });
		expect(kernel.getSnapshot().vendorChoice).toEqual({
			confirmedAt: NOW,
			denied: ['meta-pixel'],
			version: 1,
		});
		kernel.dispose();
	});

	test('a narrowed bulk action keeps the denial of a vendor another granted category still loads', async () => {
		const rule = matchedResolution(
			optInRule({ categories: ['marketing', 'measurement'] })
		);
		const kernel = createKernel({
			initialRecords: {
				...choiceRecords(
					{ marketing: true, measurement: true },
					{ fingerprint: rule.fingerprints.choice }
				),
				vendorChoice: {
					confirmedAt: NOW - 500,
					denied: ['shared'],
					version: 1,
				},
			},
			initialVendors: {
				declared: [
					...vendors.declared,
					{
						category: { or: ['marketing', 'measurement'] },
						id: 'shared',
						presentable: false,
						source: 'script',
					},
				],
				listVersion: null,
			},
		});
		await kernel.commands.save('none', { categories: ['measurement'] });
		expect(kernel.getSnapshot().vendorChoice?.denied).toEqual(['shared']);
		kernel.dispose();
	});

	test('a narrowed bulk action decides a vendor whose condition negates a selected category', async () => {
		const rule = matchedResolution(
			optInRule({ categories: ['marketing', 'measurement'] })
		);
		const kernel = createKernel({
			initialRecords: {
				...choiceRecords(
					{ marketing: true, measurement: true },
					{ fingerprint: rule.fingerprints.choice }
				),
				vendorChoice: {
					confirmedAt: NOW - 500,
					denied: ['contextual'],
					version: 1,
				},
			},
			initialVendors: {
				declared: [
					...vendors.declared,
					{
						category: { not: 'marketing' },
						id: 'contextual',
						presentable: false,
						source: 'script',
					},
				],
				listVersion: null,
			},
		});
		await kernel.commands.save('none', { categories: ['marketing'] });
		expect(kernel.getSnapshot().vendorChoice).toEqual({
			confirmedAt: NOW,
			denied: [],
			version: 1,
		});
		kernel.dispose();
	});

	test('a narrowed bulk action decides a vendor whose condition the selected categories settle together', async () => {
		const rule = matchedResolution(
			optInRule({ categories: ['experience', 'marketing', 'measurement'] })
		);
		const kernel = createKernel({
			initialPolicyResolution: rule,
			initialRecords: {
				...choiceRecords(
					{ experience: true, marketing: true, measurement: true },
					{ fingerprint: rule.fingerprints.choice }
				),
				vendorChoice: {
					confirmedAt: NOW - 500,
					denied: ['contextual'],
					version: 1,
				},
			},
			initialVendors: {
				declared: [
					...vendors.declared,
					{
						category: { and: ['measurement', { not: 'marketing' }] },
						id: 'contextual',
						presentable: false,
						source: 'script',
					},
				],
				listVersion: null,
			},
		});
		await kernel.commands.save('none', {
			categories: ['marketing', 'measurement'],
		});
		expect(kernel.getSnapshot().vendorChoice).toEqual({
			confirmedAt: NOW,
			denied: [],
			version: 1,
		});
		kernel.dispose();
	});

	test('a bulk action covering the whole choice scope clears every denial, negated conditions included', async () => {
		const rule = matchedResolution(
			optInRule({ categories: ['marketing', 'measurement'] })
		);
		const kernel = createKernel({
			initialRecords: {
				...choiceRecords(
					{ marketing: true, measurement: true },
					{ fingerprint: rule.fingerprints.choice }
				),
				vendorChoice: {
					confirmedAt: NOW - 500,
					denied: ['contextual'],
					version: 1,
				},
			},
			initialVendors: {
				declared: [
					...vendors.declared,
					{
						category: { and: ['marketing', { not: 'measurement' }] },
						id: 'contextual',
						presentable: false,
						source: 'script',
					},
				],
				listVersion: null,
			},
		});
		await kernel.commands.save('all', {
			categories: ['marketing', 'measurement'],
		});
		expect(kernel.getSnapshot().vendorChoice).toEqual({
			confirmedAt: NOW,
			denied: [],
			version: 1,
		});
		kernel.dispose();
	});

	test('an explicit grant over an empty decision renews its time', async () => {
		const kernel = createKernel({
			initialRecords: {
				...choiceRecords({ marketing: true, measurement: true }),
				vendorChoice: { confirmedAt: NOW - 500, denied: [], version: 1 },
			},
		});
		await kernel.commands.save({}, { vendors: { 'meta-pixel': true } });
		expect(kernel.getSnapshot().vendorChoice).toEqual({
			confirmedAt: NOW,
			denied: [],
			version: 1,
		});
		kernel.dispose();
	});

	test('an explicit grant over no prior decision records a timestamped empty list', async () => {
		const save = vi.fn<NonNullable<KernelTransport['save']>>(() =>
			Promise.resolve({ ok: true })
		);
		const kernel = createKernel({
			initialRecords: choiceRecords({ marketing: true, measurement: true }),
			transport: { save },
		});
		await kernel.commands.save({}, { vendors: { 'meta-pixel': true } });
		expect(kernel.getSnapshot().vendorChoice).toEqual({
			confirmedAt: NOW,
			denied: [],
			version: 1,
		});
		const payload = save.mock.calls[0]?.[0] as SavePayload;
		expect(payload.vendorChoice?.grants).toEqual({
			cdn: true,
			'google-analytics': true,
			'meta-pixel': true,
		});
		kernel.dispose();
	});

	test('a stored denial for a vendor nothing declares travels in the grant map', async () => {
		const save = vi.fn<NonNullable<KernelTransport['save']>>(() =>
			Promise.resolve({ ok: true })
		);
		const kernel = createKernel({
			initialRecords: {
				...choiceRecords({ marketing: true, measurement: true }),
				vendorChoice: {
					confirmedAt: NOW - 500,
					denied: ['meta-pixel', 'retired-vendor'],
					version: 1,
				},
			},
			transport: { save },
		});
		await kernel.commands.save({ marketing: true, measurement: false });
		const payload = save.mock.calls[0]?.[0] as SavePayload;
		expect(payload.vendorChoice?.grants).toEqual({
			cdn: true,
			'google-analytics': true,
			'meta-pixel': false,
			'retired-vendor': false,
		});
		kernel.dispose();
	});

	test('a category save with no vendor decision sends no vendor map', async () => {
		const save = vi.fn<NonNullable<KernelTransport['save']>>(() =>
			Promise.resolve({ ok: true })
		);
		const kernel = createKernel({ transport: { save } });
		await kernel.commands.save({ marketing: true, measurement: true });
		expect(kernel.getSnapshot().vendorChoice).toBeNull();
		const payload = save.mock.calls[0]?.[0] as SavePayload;
		expect(payload.vendorChoice).toBeUndefined();
		kernel.dispose();
	});

	test('a bulk action over an empty choice scope is not the full clear', async () => {
		const kernel = createKernel({
			consentCategories: ['functionality'],
			initialRecords: {
				...choiceRecords({ marketing: true, measurement: true }),
				vendorChoice: {
					confirmedAt: NOW - 500,
					denied: ['google-analytics', 'meta-pixel'],
					version: 1,
				},
			},
		});
		expect(kernel.getSnapshot().evaluationPolicy.choiceScope).toEqual([]);
		await kernel.commands.save('none', { categories: ['functionality'] });
		expect(kernel.getSnapshot().vendorChoice?.denied).toEqual([
			'google-analytics',
			'meta-pixel',
		]);
		kernel.dispose();
	});

	test('a full bulk action clears a denial retained for a vendor no longer declared', async () => {
		const kernel = createKernel({
			initialRecords: {
				...choiceRecords({ marketing: true, measurement: true }),
				vendorChoice: {
					confirmedAt: NOW - 500,
					denied: ['meta-pixel'],
					version: 1,
				},
			},
			initialVendors: { declared: [], listVersion: null },
		});
		await kernel.commands.save('all');
		expect(kernel.getSnapshot().vendorChoice).toEqual({
			confirmedAt: NOW,
			denied: [],
			version: 1,
		});
		kernel.dispose();
	});

	test('a full bulk action with nothing declared still sends the cleared map', async () => {
		const save = vi.fn<NonNullable<KernelTransport['save']>>(() =>
			Promise.resolve({ ok: true })
		);
		const kernel = createKernel({
			initialRecords: {
				...choiceRecords({ marketing: true, measurement: true }),
				vendorChoice: {
					confirmedAt: NOW - 500,
					denied: ['meta-pixel'],
					version: 1,
				},
			},
			initialVendors: { declared: [], listVersion: null },
			transport: { save },
		});
		await kernel.commands.save('all');
		const payload = save.mock.calls[0]?.[0] as SavePayload;
		expect(payload.vendorChoice).toEqual({
			confirmedAt: NOW,
			grants: { 'meta-pixel': true },
			version: 1,
		});
		kernel.dispose();
	});

	test('a bulk action with no declared vendors records no vendor decision', async () => {
		const kernel = createKernel({
			initialRecords: choiceRecords({ marketing: true, measurement: true }),
			initialVendors: undefined,
		});
		await kernel.commands.save('all');
		expect(kernel.getSnapshot().vendorChoice).toBeNull();
		kernel.dispose();
	});

	test("'all' and 'none' clear the denial list", async () => {
		const kernel = createKernel({
			initialRecords: {
				...choiceRecords({ marketing: true, measurement: true }),
				vendorChoice: {
					confirmedAt: NOW - 500,
					denied: ['meta-pixel'],
					version: 1,
				},
			},
		});
		await kernel.commands.save('none');
		expect(kernel.getSnapshot().vendorChoice).toEqual({
			confirmedAt: NOW,
			denied: [],
			version: 1,
		});
		await kernel.commands.save('all', { vendors: { 'meta-pixel': false } });
		expect(kernel.getSnapshot().vendorChoice?.denied).toEqual([]);
		kernel.dispose();
	});

	test('a category save with a vendor toggle emits both events in one action', async () => {
		const kernel = createKernel();
		const choice = vi.fn();
		const recorded = vi.fn();
		kernel.events.on('choice:recorded', choice);
		kernel.events.on('vendors:recorded', recorded);
		await kernel.commands.save(
			{ marketing: true, measurement: true },
			{ vendors: { 'meta-pixel': false } }
		);
		expect(choice).toHaveBeenCalledOnce();
		expect(recorded).toHaveBeenCalledOnce();
		expect(recorded.mock.calls[0]?.[0].actionAt).toBe(NOW);
		kernel.dispose();
	});

	test('a none regime still records a vendor toggle', async () => {
		const kernel = createKernel({
			initialPolicyResolution: matchedResolution(noneRule()),
		});
		const result = await kernel.commands.save(
			{},
			{
				vendors: { 'meta-pixel': false },
			}
		);
		expect(result.ok).toBe(true);
		expect(kernel.getSnapshot().vendorChoice?.denied).toEqual(['meta-pixel']);
		expect(kernel.getSnapshot().explicitChoice).toBeNull();
		kernel.dispose();
	});

	test('the vendor axis is inert under an IAB policy', async () => {
		const kernel = createKernel({
			initialIab: { enabled: true },
			initialPolicyResolution: matchedResolution(iabRule()),
		});
		expect(kernel.getSnapshot().model).toBe('iab');
		const result = await kernel.commands.save(
			{},
			{
				vendors: { 'meta-pixel': false },
			}
		);
		expect(result.confirmed).toEqual([]);
		expect(kernel.getSnapshot().vendorChoice).toBeNull();
		kernel.dispose();
	});
});

const initWith = async function initWith(
	overrides: KernelConfig,
	...responses: InitResponse[]
) {
	const init = vi.fn();
	for (const response of responses) {
		init.mockResolvedValueOnce(response);
	}
	const kernel = createKernel({
		...overrides,
		initRetry: false,
		transport: { init },
	});
	const before = kernel.getSnapshot();
	const after: ConsentSnapshot[] = [];
	for (const _ of responses) {
		// oxlint-disable-next-line no-await-in-loop -- inits run in order
		await kernel.commands.init();
		after.push(kernel.getSnapshot());
	}
	kernel.dispose();
	return { after, before };
};

describe('server records and init', () => {
	test('init folds backend vendors under code-declared presentation', async () => {
		const {
			after: [snapshot],
		} = await initWith(
			{},
			{
				policyResolution: {
					fingerprints: matchedResolution(optInRule()).fingerprints,
					matchedBy: 'default',
					policy: matchedResolution(optInRule()).policy,
					policyId: 'test-opt-in',
					status: 'matched',
					version: 1,
				},
				vendorListVersion: '2026-10',
				vendors: [
					{
						category: 'marketing',
						id: 'meta-pixel',
						name: 'Meta (backend)',
						privacyPolicyUrl: 'https://example.com/backend',
					},
					{
						category: 'experience',
						id: 'intercom',
						name: 'Intercom',
						privacyPolicyUrl: 'https://www.intercom.com/legal/privacy',
					},
				],
			}
		);
		expect(snapshot?.vendors?.listVersion).toBe('2026-10');
		expect(snapshot?.vendors?.declared.map((vendor) => vendor.id)).toEqual([
			'cdn',
			'google-analytics',
			'intercom',
			'meta-pixel',
		]);
		expect(
			snapshot?.vendors?.declared.find((vendor) => vendor.id === 'meta-pixel')
				?.name
		).toBe('Meta Pixel');
	});

	test('a newer all-granted server map clears an older local denial', async () => {
		const {
			after: [snapshot],
		} = await initWith(
			{
				initialRecords: {
					...choiceRecords({ marketing: true }),
					vendorChoice: {
						confirmedAt: NOW - 10,
						denied: ['meta-pixel'],
						version: 1,
					},
				},
			},
			{
				records: {
					vendorChoice: { confirmedAt: NOW - 5, denied: [], version: 1 },
				},
			}
		);
		expect(snapshot?.vendorChoice).toEqual({
			confirmedAt: NOW - 5,
			denied: [],
			version: 1,
		});
	});

	test('granting the last denied vendor survives an older server denial that lands afterwards', async () => {
		const {
			before,
			after: [snapshot],
		} = await initWith(
			{
				initialRecords: {
					...choiceRecords({ marketing: true }),
					vendorChoice: { confirmedAt: NOW - 2, denied: [], version: 1 },
				},
			},
			{
				records: {
					vendorChoice: {
						confirmedAt: NOW - 10,
						denied: ['meta-pixel'],
						version: 1,
					},
				},
			}
		);
		expect(snapshot?.vendorChoice).toBe(before.vendorChoice);
	});

	test('a later init replaces the previous backend vendor list', async () => {
		const {
			after: [snapshot],
		} = await initWith(
			{
				initialVendors: {
					declared: [
						...vendors.declared,
						{
							category: 'experience',
							id: 'old-backend',
							name: 'Old',
							presentable: true,
							privacyPolicyUrl: 'https://example.com/old',
							source: 'manifest',
						},
					],
					listVersion: '1',
				},
			},
			{
				vendorListVersion: '2',
				vendors: [
					{
						category: 'experience',
						id: 'intercom',
						name: 'Intercom',
						privacyPolicyUrl: 'https://www.intercom.com/legal/privacy',
					},
				],
			}
		);
		expect(snapshot?.vendors?.listVersion).toBe('2');
		expect(snapshot?.vendors?.declared.map((vendor) => vendor.id)).toEqual([
			'cdn',
			'google-analytics',
			'intercom',
			'meta-pixel',
		]);
	});

	test('a replacement list without a version drops the previous label', async () => {
		const config: KernelConfig = {
			initialVendors: { declared: [], listVersion: '1' },
		};
		const {
			after: [replaced],
		} = await initWith(config, {
			vendors: [
				{
					category: 'experience',
					id: 'intercom',
					name: 'Intercom',
					privacyPolicyUrl: 'https://www.intercom.com/legal/privacy',
				},
			],
		});
		expect(replaced?.vendors?.listVersion).toBeNull();
		const {
			after: [relabelled],
		} = await initWith(config, { vendorListVersion: '2' });
		expect(relabelled?.vendors?.listVersion).toBe('2');
	});

	test('server vendor records merge newest-wins on init', async () => {
		const {
			before,
			after: [older, newer],
		} = await initWith(
			{
				initialRecords: {
					...choiceRecords({ marketing: true }),
					vendorChoice: {
						confirmedAt: NOW - 10,
						denied: ['meta-pixel'],
						version: 1,
					},
				},
			},
			{
				records: {
					vendorChoice: { confirmedAt: NOW - 20, denied: [], version: 1 },
				},
			},
			{
				records: {
					vendorChoice: {
						confirmedAt: NOW - 5,
						denied: ['google-analytics'],
						version: 1,
					},
				},
			}
		);
		expect(older?.vendorChoice).toBe(before.vendorChoice);
		expect(newer?.vendorChoice?.denied).toEqual(['google-analytics']);
	});
});

describe('in-flight saves', () => {
	test('a failed save queues its vendor map when only a category was superseded', async () => {
		let fail: ((error: Error) => void) | undefined;
		const save = vi
			.fn<NonNullable<KernelTransport['save']>>()
			.mockImplementationOnce(
				() =>
					new Promise((_resolve, reject) => {
						fail = reject;
					})
			)
			.mockResolvedValue({ ok: true });
		const outboxStore = createMemoryOutboxStore();
		const kernel = createKernel({ transport: { save } }, outboxStore);
		const pending = kernel.commands.save(
			{ marketing: true, measurement: true },
			{ vendors: { 'meta-pixel': false } }
		);
		await new Promise((resolve) => {
			setTimeout(resolve, 0);
		});
		await new Promise((resolve) => {
			setTimeout(resolve, 0);
		});
		expect(save).toHaveBeenCalledTimes(1);
		await kernel.commands.save({ measurement: false });
		fail?.(new Error('offline'));
		await pending;
		const enqueued = await outboxStore.transact((tx) =>
			((tx.read('saves') ?? []) as { payload: SavePayload }[]).map(
				(entry) => entry.payload
			)
		);
		expect(enqueued).toHaveLength(1);
		expect(Object.keys(enqueued[0]?.confirmed.categories ?? {})).toEqual([
			'marketing',
		]);
		expect(enqueued[0]?.vendorChoice?.grants['meta-pixel']).toBe(false);
		kernel.dispose();
	});

	test('a later vendor toggle strips the stale map but keeps category receipts', async () => {
		let release: (() => void) | undefined;
		const sent: SavePayload[] = [];
		const save = vi.fn<NonNullable<KernelTransport['save']>>(
			(payload) =>
				new Promise((resolve) => {
					sent.push(payload);
					release = () => resolve({ ok: true });
				})
		);
		const kernel = createKernel({ transport: { save } });
		const first = kernel.commands.save(
			{ marketing: true, measurement: true },
			{ vendors: { 'meta-pixel': false } }
		);
		await new Promise((resolve) => {
			setTimeout(resolve, 0);
		});
		await new Promise((resolve) => {
			setTimeout(resolve, 0);
		});
		expect(sent).toHaveLength(1);
		expect(sent[0]?.vendorChoice?.grants['meta-pixel']).toBe(false);
		const second = kernel.commands.save(
			{},
			{ vendors: { 'meta-pixel': true } }
		);
		release?.();
		await first;
		await new Promise((resolve) => {
			setTimeout(resolve, 0);
		});
		release?.();
		await second;
		expect(sent).toHaveLength(2);
		expect(sent[1]?.vendorChoice?.grants['meta-pixel']).toBe(true);
		expect(Object.keys(sent[1]?.confirmed.categories ?? {})).toEqual([]);
		expect(Object.keys(sent[0]?.confirmed.categories ?? {})).toEqual([
			'marketing',
			'measurement',
		]);
		kernel.dispose();
	});
});
