import {
	AD_TECH_PROVIDER_PURPOSES,
	ADDITIONAL_CONSENT_V2_PATTERN,
} from '@c15t/schema/types';

import { recordCategoryPatch } from '../consent-record/record';
import type {
	ConsentSubject,
	OptionalConsentCategory,
} from '../consent-record/types';
import type { AllConsentNames } from '../consent/consent-types';
import type { ExperimentAssignment } from '../libs/experiment';
import { generateSubjectId } from '../libs/generate-subject-id';
import { extractConsentNamesFromCondition, has } from '../libs/has';
import type { HasCondition } from '../libs/has';
import { presentedSelection, scopeSelection } from '../policy';
import type { PresentedSelection } from '../policy';
import type {
	ConsentSnapshot,
	ConsentState,
	ExplicitChoice,
	KernelEvent,
	KernelIABAuthority,
	NoticeDismissal,
	NoticeDismissResult,
	SaveInput,
	SavePayload,
	SaveResult,
	SaveUISource,
	VendorChoice,
} from '../types';
import type { SnapshotPatch } from './patch';
import type { KernelRuntime } from './runtime';
import type { SaveOutbox } from './save-outbox';
import { buildDraft, copyIABAuthority, isPromptSurface } from './snapshot';

const resolveSaveSelection = function resolveSaveSelection(
	snapshot: ConsentSnapshot,
	draft: PresentedSelection | null,
	input: SaveInput | undefined,
	categories?: readonly AllConsentNames[]
): { values: unknown; consentAction: SavePayload['consentAction'] } {
	const rule = snapshot.policyRule;
	const choiceScope = snapshot.evaluationPolicy.choiceScope ?? rule.scope;
	const displayed =
		categories === undefined
			? choiceScope
			: choiceScope.filter((category) => categories.includes(category));
	const narrow = (values: PresentedSelection) =>
		displayed.length === rule.scope.length
			? values
			: Object.fromEntries(
					displayed.map((category) => [category, values[category]])
				);
	if (input === 'all' || input === 'none') {
		const bulkAction = input === 'all' ? 'all' : 'necessary';
		return {
			consentAction: bulkAction,
			values: narrow(scopeSelection(rule, input === 'all')),
		};
	}
	if (input === undefined) {
		return {
			consentAction: 'custom',
			values: narrow(presentedSelection(rule, draft, snapshot.explicitChoice)),
		};
	}
	return { consentAction: 'custom', values: input };
};

const EMPTY_CHOICE: ExplicitChoice = Object.freeze({
	categories: Object.freeze({}),
	version: 3,
}) as ExplicitChoice;

const splitSaveInput = function splitSaveInput(
	rawInput: SaveInput | undefined
): {
	input: 'all' | 'none' | Partial<ConsentState> | undefined;
	vendors: Record<string, boolean> | undefined;
} {
	if (rawInput === undefined || typeof rawInput !== 'object') {
		return { input: rawInput, vendors: undefined };
	}
	if (!Object.hasOwn(rawInput, 'vendors')) {
		return { input: rawInput, vendors: undefined };
	}
	const { vendors, ...categories } = rawInput;
	return { input: categories, vendors: vendors as Record<string, boolean> };
};

const isVendorGrantMap = function isVendorGrantMap(
	value: unknown
): value is Record<string, boolean> {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		return false;
	}
	return Object.entries(value).every(
		([id, granted]) => id.length > 0 && typeof granted === 'boolean'
	);
};

const toggleableVendorIds = function toggleableVendorIds(
	snapshot: ConsentSnapshot
): ReadonlySet<string> {
	const ids = new Set<string>();
	for (const vendor of snapshot.vendors?.declared ?? []) {
		if (vendor.disabled !== true) {
			ids.add(vendor.id);
		}
	}
	return ids;
};

const coversChoiceScope = function coversChoiceScope(
	snapshot: ConsentSnapshot,
	categories: readonly AllConsentNames[]
): boolean {
	const scope =
		snapshot.evaluationPolicy.choiceScope ?? snapshot.policyRule.scope;
	return (
		scope.length > 0 && scope.every((category) => categories.includes(category))
	);
};

const conditionOutcome = function conditionOutcome(
	condition: HasCondition<AllConsentNames>,
	consents: ConsentState
): boolean | null {
	try {
		return has(condition, consents);
	} catch {
		return null;
	}
};

const settledBySelection = function settledBySelection(
	condition: HasCondition<AllConsentNames>,
	afterAction: ConsentState,
	selected: ReadonlySet<AllConsentNames>
): boolean {
	const expected = conditionOutcome(condition, afterAction);
	if (expected === null) {
		return false;
	}
	const free = [...new Set(extractConsentNamesFromCondition(condition))].filter(
		(name) => !selected.has(name)
	);
	const flipped = free.map(() => false);
	const advance = (): boolean => {
		for (const [index] of free.entries()) {
			flipped[index] = !flipped[index];
			if (flipped[index]) {
				return true;
			}
		}
		return false;
	};
	while (advance()) {
		const state: ConsentState = { ...afterAction };
		for (const [index, name] of free.entries()) {
			if (flipped[index]) {
				state[name] = !afterAction[name];
			}
		}
		if (conditionOutcome(condition, state) !== expected) {
			return false;
		}
	}
	return true;
};

const scopedBulkVendorChoice = function scopedBulkVendorChoice(
	snapshot: ConsentSnapshot,
	categories: readonly AllConsentNames[],
	granted: boolean,
	actionAt: number
): VendorChoice | null {
	const current = snapshot.vendorChoice;
	const selected = new Set(categories);
	const afterAction: ConsentState = { ...snapshot.effectivePermissions };
	for (const category of selected) {
		afterAction[category] = granted;
	}
	const governed = new Set<string>();
	for (const vendor of snapshot.vendors?.declared ?? []) {
		const names = extractConsentNamesFromCondition(vendor.category);
		if (!names.some((name) => selected.has(name))) {
			continue;
		}
		if (settledBySelection(vendor.category, afterAction, selected)) {
			governed.add(vendor.id);
		}
	}
	if (governed.size === 0) {
		return current;
	}
	const denied = (current?.denied ?? []).filter((id) => !governed.has(id));
	if (current && denied.length === current.denied.length) {
		return current.confirmedAt >= actionAt
			? current
			: { confirmedAt: actionAt, denied: [...current.denied], version: 1 };
	}
	return { confirmedAt: actionAt, denied, version: 1 };
};

const bulkClearedVendorChoice = function bulkClearedVendorChoice(
	snapshot: ConsentSnapshot,
	actionAt: number
): VendorChoice | null {
	const current = snapshot.vendorChoice;
	if (
		(snapshot.vendors?.declared.length ?? 0) === 0 &&
		(current?.denied.length ?? 0) === 0
	) {
		return current;
	}
	if (current?.denied.length === 0 && current.confirmedAt >= actionAt) {
		return current;
	}
	return { confirmedAt: actionAt, denied: [], version: 1 };
};

const applyVendorGrants = function applyVendorGrants(
	snapshot: ConsentSnapshot,
	current: readonly string[] | undefined,
	grants: Readonly<Record<string, boolean>> | undefined
): string[] {
	const toggleable = toggleableVendorIds(snapshot);
	const denied = new Set<string>(current);
	for (const [id, granted] of Object.entries(grants ?? {})) {
		if (!toggleable.has(id)) {
			continue;
		}
		if (granted) {
			denied.delete(id);
		} else {
			denied.add(id);
		}
	}
	return [...denied].sort();
};

const resolveVendorSelection = function resolveVendorSelection(
	snapshot: ConsentSnapshot,
	input: SaveInput | undefined,
	explicit: Record<string, boolean> | undefined,
	actionAt: number,
	categories?: readonly AllConsentNames[]
): VendorChoice | null {
	const current = snapshot.vendorChoice;
	if (snapshot.model === 'iab') {
		return current;
	}
	const bulk = input === 'all' || input === 'none';
	if (bulk) {
		if (categories === undefined || coversChoiceScope(snapshot, categories)) {
			return bulkClearedVendorChoice(snapshot, actionAt);
		}
		return scopedBulkVendorChoice(
			snapshot,
			categories,
			input === 'all',
			actionAt
		);
	}
	if (explicit === undefined) {
		return current;
	}
	const toggleable = toggleableVendorIds(snapshot);
	const usable = Object.keys(explicit).some((id) => toggleable.has(id));
	if (!usable) {
		return current;
	}
	const denied = applyVendorGrants(snapshot, current?.denied, explicit);
	return { confirmedAt: actionAt, denied, version: 1 };
};

const vendorChoicePayload = function vendorChoicePayload(
	snapshot: ConsentSnapshot,
	previous: ConsentSnapshot['vendorChoice']
): SavePayload['vendorChoice'] {
	const declared = snapshot.vendors?.declared ?? [];
	if (snapshot.model === 'iab' || snapshot.vendorChoice === null) {
		return undefined;
	}
	const denied = new Set(snapshot.vendorChoice.denied);
	const grants: Record<string, boolean> = {};
	for (const vendor of declared) {
		Object.defineProperty(grants, vendor.id, {
			configurable: true,
			enumerable: true,
			value: !denied.has(vendor.id),
			writable: true,
		});
	}
	for (const id of denied) {
		if (!Object.hasOwn(grants, id)) {
			Object.defineProperty(grants, id, {
				configurable: true,
				enumerable: true,
				value: false,
				writable: true,
			});
		}
	}
	for (const id of previous?.denied ?? []) {
		if (!Object.hasOwn(grants, id)) {
			Object.defineProperty(grants, id, {
				configurable: true,
				enumerable: true,
				value: true,
				writable: true,
			});
		}
	}
	return {
		confirmedAt: snapshot.vendorChoice.confirmedAt,
		grants,
		version: 1,
	};
};

const isValidSaveActionAt = function isValidSaveActionAt(
	actionAt: number,
	currentTime: number
): boolean {
	return (
		Number.isSafeInteger(actionAt) && actionAt >= 0 && actionAt <= currentTime
	);
};

const saveUnderNoneRegime = function saveUnderNoneRegime(
	snapshot: ConsentSnapshot
): SaveResult | null {
	if (snapshot.evaluationPolicy.model !== 'none') {
		return null;
	}
	return { confirmed: [], ok: true, subjectId: snapshot.subject?.subjectId };
};

const choiceAcknowledgement = function choiceAcknowledgement(
	snapshot: ConsentSnapshot,
	actionAt: number
): NoticeDismissal | null {
	const policy = snapshot.evaluationPolicy;
	if (
		policy.prompt !== 'choice' ||
		(policy.choiceScope ?? policy.scope).length > 0
	) {
		return null;
	}
	const current = snapshot.noticeDismissal;
	if (
		current &&
		current.fingerprint === policy.choice.fingerprint &&
		current.dismissedAt >= actionAt
	) {
		return current;
	}
	return {
		dismissedAt: actionAt,
		fingerprint: policy.choice.fingerprint,
		version: 1,
	};
};

const applyNoticeAcknowledgement = function applyNoticeAcknowledgement(
	patch: SnapshotPatch,
	before: ConsentSnapshot,
	actionAt: number
): void {
	if (
		patch.noticeDismissal !== undefined ||
		before.evaluationPolicy.prompt !== 'notice' ||
		before.promptRequirement.kind !== 'notice'
	) {
		return;
	}
	patch.noticeDismissal = {
		dismissedAt: actionAt,
		fingerprint: before.evaluationPolicy.notice.fingerprint,
		version: 1,
	};
};

const saveSubject = function saveSubject(
	snapshot: ConsentSnapshot,
	subjectId: string
): ConsentSubject {
	const subject: ConsentSubject = { ...snapshot.subject, subjectId };
	if (snapshot.user?.externalId) {
		subject.externalId = snapshot.user.externalId;
		if (snapshot.user.identityProvider) {
			subject.identityProvider = snapshot.user.identityProvider;
		}
	}
	return subject;
};

const saveDecisionInputs = (
	snapshot: ConsentSnapshot
): Pick<SavePayload, 'decisionInputs'> => {
	if (
		snapshot.resolution.status !== 'no-match' &&
		snapshot.resolution.status !== 'matched'
	) {
		return {};
	}
	return {
		decisionInputs: {
			country: snapshot.location
				? snapshot.location.countryCode
				: (snapshot.overrides.country ?? null),
			fingerprint:
				snapshot.resolution.status === 'matched'
					? snapshot.resolution.fingerprints.policy
					: undefined,
			gpc: snapshot.privacySignals.gpc.active,
			language:
				snapshot.translations?.language ?? snapshot.overrides.language ?? 'en',
			policyId:
				snapshot.resolution.status === 'matched'
					? snapshot.resolution.policyId
					: null,
			region: snapshot.location
				? snapshot.location.regionCode
				: (snapshot.overrides.region ?? null),
		},
	};
};

const isRecord = function isRecord(
	value: unknown
): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
};

const isIntegerIn = (value: unknown, min: number, max: number): boolean =>
	typeof value === 'number' &&
	Number.isInteger(value) &&
	value >= min &&
	value <= max;

const everyIndex = (
	list: readonly unknown[],
	check: (entry: unknown) => boolean
): boolean => {
	for (let index = 0; index < list.length; index += 1) {
		if (!(index in list && check(list[index]))) {
			return false;
		}
	}
	return true;
};

const validPublisherRestrictions = function validPublisherRestrictions(
	value: unknown
): boolean {
	return (
		value === undefined ||
		(Array.isArray(value) &&
			everyIndex(
				value,
				(restriction) =>
					isRecord(restriction) &&
					isIntegerIn(restriction.purposeId, 1, 63) &&
					isIntegerIn(restriction.restrictionType, 0, 2) &&
					Array.isArray(restriction.vendorIds) &&
					everyIndex(restriction.vendorIds, (id) => isIntegerIn(id, 1, 65_535))
			))
	);
};

const isBooleanMap = (value: unknown): value is Record<string, boolean> =>
	isRecord(value) &&
	Object.values(value).every((entry) => typeof entry === 'boolean');

const additionalConsentIds = (part: string): string[] =>
	part === '' ? [] : part.split('.');

const validAdditionalConsent = function validAdditionalConsent(
	authority: Record<string, unknown>,
	snapshot: ConsentSnapshot
): boolean {
	const { addtlConsent, adTechProviderConsents: switches } = authority;
	if (switches === undefined) {
		return addtlConsent === undefined;
	}
	const listed = new Set(
		(snapshot.iab?.adTechProviders ?? []).map(({ id }) => String(id))
	);
	if (
		!isBooleanMap(switches) ||
		!Object.keys(switches).every((id) => listed.has(id))
	) {
		return false;
	}
	if (addtlConsent === undefined) {
		return Object.keys(switches).length === 0;
	}
	if (
		typeof addtlConsent !== 'string' ||
		!ADDITIONAL_CONSENT_V2_PATTERN.test(addtlConsent)
	) {
		return false;
	}
	const [, consentedPart = '', disclosedPart = ''] = addtlConsent.split('~');
	const consented = additionalConsentIds(consentedPart);
	const disclosed = [
		...consented,
		...additionalConsentIds(disclosedPart.slice(3)),
	];
	const { purposeConsents } = authority;
	const purposesGranted =
		isRecord(purposeConsents) &&
		AD_TECH_PROVIDER_PURPOSES.every(
			(purpose) => purposeConsents[purpose] === true
		);
	const granted = purposesGranted
		? Object.keys(switches).filter((id) => switches[id] === true)
		: [];
	return (
		consented.length === granted.length &&
		consented.every((id) => switches[id] === true) &&
		new Set(disclosed).size === disclosed.length &&
		disclosed.length === Object.keys(switches).length &&
		disclosed.every((id) => Object.hasOwn(switches, id))
	);
};

const validSaveAuthority = function validSaveAuthority(
	value: unknown,
	snapshot: ConsentSnapshot,
	actionAt: number,
	now: number
): value is KernelIABAuthority {
	if (!isRecord(value)) {
		return false;
	}
	const authority = value;
	return (
		snapshot.model === 'iab' &&
		snapshot.resolution.status === 'matched' &&
		snapshot.iab?.enabled === true &&
		typeof authority.tcString === 'string' &&
		authority.tcString.length > 0 &&
		authority.choiceFingerprint ===
			snapshot.evaluationPolicy.choice.fingerprint &&
		authority.confirmedAt === actionAt &&
		typeof authority.expiresAt === 'number' &&
		Number.isSafeInteger(authority.expiresAt) &&
		authority.expiresAt > now &&
		authority.expiresAt > actionAt &&
		authority.expiresAt <=
			actionAt +
				Math.min(
					snapshot.evaluationPolicy.choice.maxAgeMs ?? 395 * 86400000,
					395 * 86400000
				) &&
		validPublisherRestrictions(authority.publisherRestrictions) &&
		validAdditionalConsent(authority, snapshot) &&
		[
			authority.vendorConsents,
			authority.vendorLegitimateInterests,
			authority.purposeConsents,
			authority.purposeLegitimateInterests,
			authority.specialFeatureOptIns,
		].every(
			(map) =>
				map !== null &&
				typeof map === 'object' &&
				!Array.isArray(map) &&
				Object.values(map).every((entry) => typeof entry === 'boolean')
		)
	);
};

const applySaveAuthority = function applySaveAuthority(
	patch: SnapshotPatch,
	snapshot: ConsentSnapshot,
	authority?: KernelIABAuthority
): void {
	if (authority && snapshot.iab) {
		patch.iab = {
			...snapshot.iab,
			authority: copyIABAuthority(authority),
			tcString: authority.tcString,
		};
	}
};

const saveAttribution = function saveAttribution(
	current: ConsentSnapshot,
	requested: SaveUISource | undefined,
	actionAt: number
): {
	uiSource: SaveUISource;
	timeToDecisionMs?: number;
	experiment?: ExperimentAssignment;
} {
	const uiSource = requested ?? current.activeUI;
	const attribution: ReturnType<typeof saveAttribution> = { uiSource };
	if (current.experiment && current.surfaceShownAt.banner !== null) {
		attribution.experiment = current.experiment;
	}
	if (!isPromptSurface(uiSource)) {
		return attribution;
	}
	const shownAt = current.surfaceShownAt[uiSource];
	if (shownAt === null || actionAt < shownAt) {
		return attribution;
	}
	attribution.timeToDecisionMs = actionAt - shownAt;
	return attribution;
};

const mergeDraft = function mergeDraft(
	current: PresentedSelection | null,
	input: Partial<ConsentState>
): PresentedSelection | null {
	const patch = buildDraft(input);
	if (!patch) {
		return current;
	}
	return { ...current, ...patch };
};

const createBoundDraft = function createBoundDraft<Values>(
	getSnapshot: () => ConsentSnapshot,
	initial: Values | null
) {
	const fingerprint = () => getSnapshot().evaluationPolicy.choice.fingerprint;
	let bound: { fingerprint: string; values: Values } | null = initial
		? { fingerprint: fingerprint(), values: initial }
		: null;
	return {
		get: (): Values | null =>
			bound && bound.fingerprint === fingerprint() ? bound.values : null,
		set(values: Values | null): void {
			bound = values ? { fingerprint: fingerprint(), values } : null;
		},
	};
};

export interface ChoiceRecorderOptions {
	runtime: KernelRuntime;
	outbox: Pick<SaveOutbox, 'send'>;
	initialDraft: PresentedSelection | null;
}

// oxlint-disable-next-line max-lines-per-function -- save() keeps the order of one action visible.
export const createChoiceRecorder = function createChoiceRecorder({
	runtime,
	outbox,
	initialDraft,
}: ChoiceRecorderOptions) {
	const { batch, getSnapshot, commit, emit } = runtime;
	const draft = createBoundDraft<PresentedSelection>(getSnapshot, initialDraft);

	return {
		dismissNotice(context?: {
			actionAt?: number;
		}): Promise<NoticeDismissResult> {
			const snapshot = getSnapshot();
			if (snapshot.promptRequirement.kind !== 'notice') {
				return Promise.resolve({ ok: false, reason: 'not-required' });
			}
			const currentTime = runtime.now();
			const actionAt =
				context?.actionAt !== undefined &&
				isValidSaveActionAt(context.actionAt, currentTime)
					? context.actionAt
					: currentTime;
			const dismissal = {
				dismissedAt: actionAt,
				fingerprint: snapshot.evaluationPolicy.notice.fingerprint,
				version: 1 as const,
			};
			const {
				experiment,
				uiSource: surface,
				timeToDecisionMs,
			} = saveAttribution(snapshot, undefined, actionAt);
			batch(() => {
				commit({ noticeDismissal: dismissal, now: currentTime });
				const event: Extract<KernelEvent, { type: 'notice:dismissed' }> = {
					dismissal,
					snapshot: getSnapshot(),
					surface,
					type: 'notice:dismissed',
				};
				if (timeToDecisionMs !== undefined) {
					event.timeToDecisionMs = timeToDecisionMs;
				}
				if (experiment) {
					event.experiment = experiment;
				}
				emit(event);
			});
			return Promise.resolve({ dismissal, ok: true });
		},

		draft(input: Partial<ConsentState>): void {
			draft.set(mergeDraft(draft.get(), input));
		},

		// oxlint-disable-next-line complexity -- One action records categories and vendors together in a fixed order.
		async save(
			rawInput?: SaveInput,
			context?: {
				actionAt?: number;
				iabAuthority?: KernelIABAuthority;
				categories?: readonly AllConsentNames[];
				vendors?: Record<string, boolean>;
				uiSource?: SaveUISource;
			}
		): Promise<SaveResult> {
			if (getSnapshot().externalPermissions) {
				throw new Error(
					'Consent is owned by an external CMP. Save through that provider.'
				);
			}

			const { input, vendors: inlineVendors } = splitSaveInput(rawInput);
			const explicitVendors = context?.vendors ?? inlineVendors;
			const currentTime = runtime.now();
			const actionAt =
				context?.actionAt === undefined ? currentTime : context.actionAt;
			if (!isValidSaveActionAt(actionAt, currentTime)) {
				return {
					issues: [{ code: 'invalid-timestamp', path: 'actionAt' }],
					ok: false,
				};
			}
			if (
				context?.iabAuthority !== undefined &&
				!validSaveAuthority(
					context.iabAuthority,
					getSnapshot(),
					actionAt,
					currentTime
				)
			) {
				return { ok: false };
			}
			if (explicitVendors !== undefined && !isVendorGrantMap(explicitVendors)) {
				return {
					issues: [{ code: 'invalid-boolean', path: 'vendors' }],
					ok: false,
				};
			}
			emit({ type: 'command:save:started' });

			const before = getSnapshot();
			const nextVendorChoice = resolveVendorSelection(
				before,
				input,
				explicitVendors,
				actionAt,
				context?.categories
			);
			const vendorsChanged = nextVendorChoice !== before.vendorChoice;
			const owedNothing = saveUnderNoneRegime(before);
			if (owedNothing && !vendorsChanged) {
				emit({ result: owedNothing, type: 'command:save:completed' });
				return owedNothing;
			}
			const { uiSource, ...decisionTiming } = saveAttribution(
				before,
				context?.uiSource,
				actionAt
			);
			let consentAction: SavePayload['consentAction'] = 'custom';
			let recorded: ReturnType<typeof recordCategoryPatch>;
			if (owedNothing) {
				recorded = {
					choice: before.explicitChoice ?? EMPTY_CHOICE,
					confirmed: [],
					ok: true,
				};
			} else {
				const selection = resolveSaveSelection(
					before,
					draft.get(),
					input,
					context?.categories
				);
				({ consentAction } = selection);
				recorded = recordCategoryPatch(
					before.explicitChoice,
					selection.values,
					{
						actionAt,
						now: currentTime,
						policy: before.evaluationPolicy,
					}
				);
			}
			if (recorded.ok === false) {
				const result: SaveResult = { issues: recorded.issues, ok: false };
				emit({ result, type: 'command:save:completed' });
				return result;
			}
			const categoriesChanged = recorded.confirmed.length > 0;
			const acknowledgement = owedNothing
				? null
				: choiceAcknowledgement(before, actionAt);
			if (!categoriesChanged && !vendorsChanged && !acknowledgement) {
				const result: SaveResult = {
					confirmed: [],
					ok: true,
					subjectId: before.subject?.subjectId,
				};
				emit({ result, type: 'command:save:completed' });
				return result;
			}

			const subjectId = before.subject?.subjectId ?? generateSubjectId();
			const subject = saveSubject(before, subjectId);
			draft.set(null);
			const patch: SnapshotPatch = {
				now: currentTime,
				subject,
			};
			if (categoriesChanged) {
				patch.explicitChoice = recorded.choice;
			}
			if (vendorsChanged) {
				patch.vendorChoice = nextVendorChoice;
			}
			const acknowledged =
				acknowledgement !== null && acknowledgement !== before.noticeDismissal;
			if (acknowledged) {
				patch.noticeDismissal = acknowledgement;
			}
			applyNoticeAcknowledgement(patch, before, actionAt);
			applySaveAuthority(patch, before, context?.iabAuthority);
			const { after, generation } = batch(() => {
				commit(patch);
				const committed = getSnapshot();
				const recordsGeneration = runtime.getGeneration();
				if (categoriesChanged) {
					emit({
						actionAt,
						confirmed: Object.freeze([...recorded.confirmed]),
						consentAction,
						snapshot: committed,
						type: 'choice:recorded',
						uiSource,
						...decisionTiming,
					});
				}
				if (vendorsChanged) {
					emit({ actionAt, snapshot: committed, type: 'vendors:recorded' });
				}
				if (acknowledged) {
					emit({
						dismissal: acknowledgement,
						snapshot: committed,
						surface: uiSource,
						type: 'notice:dismissed',
						...decisionTiming,
					});
				}
				return { after: committed, generation: recordsGeneration };
			});
			const confirmedCategories: Partial<
				Record<OptionalConsentCategory, boolean>
			> = {};
			for (const category of recorded.confirmed) {
				const decision = recorded.choice.categories[category];
				if (decision) {
					confirmedCategories[category] = decision.value;
				}
			}

			const payload: SavePayload = {
				choice: recorded.choice,
				confirmed: { actionAt, categories: confirmedCategories },
				consentAction,
				consents: after.effectivePermissions,
				...saveDecisionInputs(after),
				givenAt: actionAt,
				model: after.model,
				overrides: after.overrides,
				policySnapshotToken: after.policySnapshotToken,
				subject,
				subjectId,
				tcString: after.iab?.tcString ?? null,
				uiSource,
				user: after.user,
				...decisionTiming,
			};
			const vendorChoice = vendorChoicePayload(after, before.vendorChoice);
			if (vendorChoice) {
				payload.vendorChoice = vendorChoice;
			}
			const addtlConsent = after.iab?.authority?.addtlConsent;
			if (payload.tcString && addtlConsent) {
				payload.addtlConsent = addtlConsent;
			}

			const result = await outbox.send(payload, {
				confirmed: recorded.confirmed,
				generation,
				snapshot: after,
			});
			emit({ result, type: 'command:save:completed' });
			return result;
		},
	};
};
