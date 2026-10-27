import type { Vendor } from '@c15t/schema/types';
import { compareCanonical } from '@c15t/schema/types';

import type { AllConsentNames } from '../consent/consent-types';
import type { ConsentKernel, ResolvedVendor, VendorSource } from '../types';
import type { HasCondition } from './has';
import { extractConsentNamesFromCondition } from './has';
import type { VendorDetails } from './script-loader/types';

export interface VendorOwner {
	vendor?: string;
	category: HasCondition<AllConsentNames>;
	vendorDetails?: VendorDetails;
}

export interface ResolveVendorsInput {
	existing?: readonly ResolvedVendor[];
	config?: readonly Vendor[];
	manifest?: readonly Vendor[];
	owners?: readonly VendorOwner[];
	onWarn?: (message: string) => void;
}
const SOURCE_RANK: Record<VendorSource, number> = {
	config: 0,
	manifest: 1,
	script: 2,
};

const VENDOR_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/u;

const invalidSlugWarning = (id: string): string =>
	`[c15t] Vendor id "${id}" is not a lowercase slug of up to 64 characters (letters, digits, ".", "_" and "-"). It is ignored: anything it names is gated by its category only.`;

export const isValidVendorId = function isValidVendorId(
	value: string
): boolean {
	return VENDOR_ID_PATTERN.test(value);
};

const isPresentable = function isPresentable(
	vendor: Pick<Vendor, 'name' | 'privacyPolicyUrl'> | ResolvedVendor
): boolean {
	return (
		typeof vendor.name === 'string' &&
		vendor.name.length > 0 &&
		typeof vendor.privacyPolicyUrl === 'string' &&
		vendor.privacyPolicyUrl.length > 0
	);
};

const onlyNecessary = function onlyNecessary(
	category: HasCondition<AllConsentNames>
): boolean {
	const names = extractConsentNamesFromCondition(category);
	return names.length > 0 && names.every((name) => name === 'necessary');
};

const copyCategory = function copyCategory(
	category: HasCondition<AllConsentNames>
): HasCondition<AllConsentNames> {
	return typeof category === 'string'
		? category
		: (JSON.parse(JSON.stringify(category)) as HasCondition<AllConsentNames>);
};

const copyDetails = function copyDetails(
	details: VendorDetails
): VendorDetails {
	const copy: VendorDetails = {
		name: details.name,
		privacyPolicyUrl: details.privacyPolicyUrl,
	};
	if (details.description !== undefined) {
		copy.description = details.description;
	}
	if (details.homepageUrl !== undefined) {
		copy.homepageUrl = details.homepageUrl;
	}
	if (details.legalName !== undefined) {
		copy.legalName = details.legalName;
	}
	return copy;
};

const detailsOf = function detailsOf(
	vendor: ResolvedVendor
): VendorDetails | undefined {
	if (
		!vendor.presentable ||
		vendor.name === undefined ||
		vendor.privacyPolicyUrl === undefined
	) {
		return undefined;
	}
	return copyDetails({
		description: vendor.description,
		homepageUrl: vendor.homepageUrl,
		legalName: vendor.legalName,
		name: vendor.name,
		privacyPolicyUrl: vendor.privacyPolicyUrl,
	});
};

const toResolved = function toResolved(
	vendor: Vendor,
	source: VendorSource
): ResolvedVendor {
	return {
		...vendor,
		category: copyCategory(vendor.category),
		disabled: onlyNecessary(vendor.category) ? true : vendor.disabled,
		presentable: isPresentable(vendor),
		source,
	};
};

const sameVendor = function sameVendor(
	left: ResolvedVendor,
	right: ResolvedVendor
): boolean {
	return (
		left.source === right.source &&
		left.name === right.name &&
		left.privacyPolicyUrl === right.privacyPolicyUrl &&
		left.description === right.description &&
		left.legalName === right.legalName &&
		left.homepageUrl === right.homepageUrl &&
		left.disabled === right.disabled &&
		JSON.stringify(left.category) === JSON.stringify(right.category) &&
		JSON.stringify(left.ownerCategory) ===
			JSON.stringify(right.ownerCategory) &&
		JSON.stringify(left.ownerDetails) === JSON.stringify(right.ownerDetails) &&
		JSON.stringify(left.shadowed) === JSON.stringify(right.shadowed)
	);
};

const scriptEntry = function scriptEntry(
	id: string,
	category: HasCondition<AllConsentNames>,
	details?: VendorDetails
): ResolvedVendor {
	const entry: ResolvedVendor = {
		category,
		disabled: onlyNecessary(category) || undefined,
		id,
		presentable: false,
		source: 'script',
	};
	if (details) {
		Object.assign(entry, copyDetails(details));
		entry.presentable = isPresentable(details);
	}
	return entry;
};

const withOwners = function withOwners(
	vendor: ResolvedVendor,
	ownerCategory: HasCondition<AllConsentNames>,
	ownerDetails?: VendorDetails
): ResolvedVendor {
	if (vendor.source === 'script') {
		return scriptEntry(vendor.id, ownerCategory, ownerDetails);
	}
	const { ownerDetails: _previous, ...rest } = vendor;
	const next: ResolvedVendor = { ...rest, ownerCategory };
	if (ownerDetails) {
		next.ownerDetails = copyDetails(ownerDetails);
	}
	if (next.shadowed) {
		next.shadowed = withOwners(next.shadowed, ownerCategory, ownerDetails);
	}
	return next;
};

export const sameDeclaredVendors = function sameDeclaredVendors(
	left: readonly ResolvedVendor[],
	right: readonly ResolvedVendor[]
): boolean {
	if (left.length !== right.length) {
		return false;
	}
	const byId = new Map(right.map((vendor) => [vendor.id, vendor]));
	return left.every((vendor) => {
		const other = byId.get(vendor.id);
		return other !== undefined && sameVendor(vendor, other);
	});
};

const ownerCondition = function ownerCondition(
	categories: readonly HasCondition<AllConsentNames>[]
): HasCondition<AllConsentNames> {
	return categories.length === 1 && categories[0] !== undefined
		? categories[0]
		: { or: [...categories] };
};

export const ownerFallback = function ownerFallback(
	vendor: ResolvedVendor
): ResolvedVendor | null {
	if (vendor.shadowed) {
		return vendor.shadowed;
	}
	if (!vendor.ownerCategory) {
		return null;
	}
	return scriptEntry(vendor.id, vendor.ownerCategory, vendor.ownerDetails);
};

const withoutShadow = function withoutShadow(
	vendor: ResolvedVendor
): ResolvedVendor {
	const { shadowed, ...rest } = vendor;
	const next: ResolvedVendor = rest;
	if (!next.ownerCategory && shadowed?.ownerCategory) {
		next.ownerCategory = shadowed.ownerCategory;
		if (shadowed.ownerDetails) {
			next.ownerDetails = shadowed.ownerDetails;
		}
	}
	return next;
};

const mergeEntry = function mergeEntry(
	existing: ResolvedVendor,
	incoming: ResolvedVendor
): ResolvedVendor {
	if (SOURCE_RANK[incoming.source] > SOURCE_RANK[existing.source]) {
		const shadowable =
			existing.source === 'config' && incoming.source === 'manifest';
		if (!shadowable) {
			return existing;
		}
		const shadowed = existing.ownerCategory
			? withOwners(incoming, existing.ownerCategory)
			: incoming;
		if (existing.shadowed && sameVendor(existing.shadowed, shadowed)) {
			return existing;
		}
		return { ...existing, shadowed };
	}
	const next: ResolvedVendor = { ...incoming };
	if (existing.source === incoming.source) {
		next.shadowed ??= existing.shadowed;
	} else if (existing.source === 'script') {
		if (next.ownerCategory === undefined) {
			next.ownerCategory = existing.category;
			const details = detailsOf(existing);
			if (details) {
				next.ownerDetails = details;
			}
		}
	} else {
		next.shadowed ??= existing;
	}
	return sameVendor(existing, next) ? existing : next;
};

export const withoutSourceVendors = function withoutSourceVendors(
	declared: readonly ResolvedVendor[],
	source: VendorSource
): ResolvedVendor[] {
	const kept: ResolvedVendor[] = [];
	for (const vendor of declared) {
		if (vendor.source !== source) {
			kept.push(
				vendor.shadowed?.source === source ? withoutShadow(vendor) : vendor
			);
			continue;
		}
		const fallback = ownerFallback(vendor);
		if (fallback) {
			kept.push(fallback);
		}
	}
	return kept;
};

export const withoutManifestVendors = function withoutManifestVendors(
	declared: readonly ResolvedVendor[]
): ResolvedVendor[] {
	return withoutSourceVendors(declared, 'manifest');
};

export const mergeDeclaredVendors = function mergeDeclaredVendors(
	current: readonly ResolvedVendor[],
	incoming: readonly ResolvedVendor[]
): readonly ResolvedVendor[] {
	if (incoming.length === 0) {
		return current;
	}
	const byId = new Map<string, ResolvedVendor>();
	for (const vendor of current) {
		byId.set(vendor.id, vendor);
	}
	let changed = false;
	for (const vendor of incoming) {
		const existing = byId.get(vendor.id);
		const next = existing ? mergeEntry(existing, vendor) : vendor;
		if (next !== existing) {
			byId.set(vendor.id, next);
			changed = true;
		}
	}
	if (!changed) {
		return current;
	}
	return [...byId.values()].sort((left, right) =>
		compareCanonical(left.id, right.id)
	);
};

export const resolveVendors = function resolveVendors(
	input: ResolveVendorsInput
): readonly ResolvedVendor[] {
	const byId = new Map<string, ResolvedVendor>();
	for (const vendor of input.existing ?? []) {
		byId.set(vendor.id, vendor);
	}
	const place = (candidate: ResolvedVendor) => {
		const existing = byId.get(candidate.id);
		byId.set(
			candidate.id,
			existing ? mergeEntry(existing, candidate) : candidate
		);
	};
	const declare = (vendor: Vendor, source: 'config' | 'manifest') => {
		if (!isValidVendorId(vendor.id)) {
			input.onWarn?.(invalidSlugWarning(vendor.id));
			return;
		}
		place(toResolved(vendor, source));
	};
	for (const vendor of input.config ?? []) {
		declare(vendor, 'config');
	}
	for (const vendor of input.manifest ?? []) {
		declare(vendor, 'manifest');
	}

	const ownerCategories = new Map<string, HasCondition<AllConsentNames>[]>();
	const ownerDetails = new Map<string, VendorDetails>();
	for (const owner of input.owners ?? []) {
		if (!owner.vendor) {
			continue;
		}
		if (!isValidVendorId(owner.vendor)) {
			input.onWarn?.(invalidSlugWarning(owner.vendor));
			continue;
		}
		const list = ownerCategories.get(owner.vendor) ?? [];
		list.push(copyCategory(owner.category));
		ownerCategories.set(owner.vendor, list);
		if (
			owner.vendorDetails &&
			isPresentable(owner.vendorDetails) &&
			!ownerDetails.has(owner.vendor)
		) {
			ownerDetails.set(owner.vendor, owner.vendorDetails);
		}
	}
	for (const [id, categories] of ownerCategories) {
		const existing = byId.get(id);
		const details = ownerDetails.get(id);
		if (existing) {
			byId.set(id, withOwners(existing, ownerCondition(categories), details));
			continue;
		}
		const category = ownerCondition(categories);
		byId.set(id, scriptEntry(id, category, details));
		if (details) {
			continue;
		}
		input.onWarn?.(
			`[c15t] Vendor "${id}" is referenced by a script or rule but has no declaration with a name and privacy policy URL. It gates loading but is hidden from the preference surface until declared in \`vendors\`.`
		);
	}

	return [...byId.values()].sort((left, right) =>
		compareCanonical(left.id, right.id)
	);
};

const hasNegation = function hasNegation(
	condition: HasCondition<AllConsentNames>
): boolean {
	if (typeof condition === 'string') {
		return false;
	}
	if ('not' in condition) {
		return true;
	}
	const branches = 'and' in condition ? condition.and : condition.or;
	return (Array.isArray(branches) ? branches : [branches]).some(hasNegation);
};

export const vendorRenders = function vendorRenders(
	vendor: ResolvedVendor
): boolean {
	return vendor.presentable && !hasNegation(vendor.category);
};

export const listedVendors = function listedVendors(
	declared: readonly ResolvedVendor[],
	denied?: ReadonlySet<string> | null
): ResolvedVendor[] {
	const optedIn = declared.some((vendor) => vendor.source !== 'script');
	return declared.filter(
		(vendor) =>
			(optedIn || vendor.source !== 'script' || denied?.has(vendor.id)) &&
			vendorRenders(vendor)
	);
};

export const vendorsListedUnder = function vendorsListedUnder(
	declared: readonly ResolvedVendor[],
	category: AllConsentNames,
	denied?: ReadonlySet<string> | null
): ResolvedVendor[] {
	return listedVendors(declared, denied).filter((vendor) =>
		extractConsentNamesFromCondition(vendor.category).includes(category)
	);
};

const registries = new WeakMap<object, Map<symbol, readonly VendorOwner[]>>();

const withoutOwnerConditions = function withoutOwnerConditions(
	vendor: ResolvedVendor
): ResolvedVendor | null {
	if (vendor.source === 'script') {
		return null;
	}
	const { ownerCategory: _own, ownerDetails: _ownDetails, ...rest } = vendor;
	const next: ResolvedVendor = rest;
	if (next.shadowed) {
		const {
			ownerCategory: _shadowOwn,
			ownerDetails: _shadowDetails,
			...shadow
		} = next.shadowed;
		next.shadowed = shadow;
	}
	return next;
};

export const declareOwnedVendors = function declareOwnedVendors(
	kernel: Pick<ConsentKernel, 'getSnapshot' | 'set'>,
	owners: readonly VendorOwner[],
	source?: symbol
): void {
	let registry = registries.get(kernel);
	if (!registry) {
		registry = new Map();
		registries.set(kernel, registry);
	}
	const own = owners.filter((owner) => owner.vendor);
	const before = source === undefined ? [] : (registry.get(source) ?? []);
	if (source !== undefined) {
		if (own.length > 0) {
			registry.set(source, own);
		} else {
			registry.delete(source);
		}
	}
	const seen = new Set<string>();
	const union: VendorOwner[] = [];
	for (const owner of [...[...registry.values()].flat(), ...own]) {
		const key = `${owner.vendor}\u0000${JSON.stringify(owner.category)}\u0000${JSON.stringify(owner.vendorDetails ?? null)}`;
		if (!seen.has(key)) {
			seen.add(key);
			union.push(owner);
		}
	}
	const named = new Set(
		[...union, ...before].flatMap((owner) =>
			owner.vendor ? [owner.vendor] : []
		)
	);
	if (named.size === 0) {
		return;
	}
	const existing = kernel.getSnapshot().vendors?.declared ?? [];
	const stripped = existing.flatMap((vendor) => {
		if (!named.has(vendor.id)) {
			return [vendor];
		}
		const bare = withoutOwnerConditions(vendor);
		return bare ? [bare] : [];
	});
	const declared = resolveVendors({ existing: stripped, owners: union });
	kernel.set.vendors({ declared }, { replaceSource: 'script' });
};

export const forgetOwnedVendors = function forgetOwnedVendors(
	kernel: Pick<ConsentKernel, 'getSnapshot' | 'set'>,
	source: symbol
): void {
	if (registries.get(kernel)?.has(source)) {
		declareOwnedVendors(kernel, [], source);
	}
};
