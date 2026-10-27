import { failedResponseError } from '../libs/failed-response';
import { isValidSubjectId } from '../libs/generate-subject-id';
import type { KernelTransport, KernelUser, SaveResult } from '../types';
import { buildDecisionAssertion } from './decision-inputs';
import type { RememberedDecisionInputs } from './decision-inputs';
import { saveFailure } from './save-rejection';
import { buildSubjectPostBody, subjectsURL } from './subject-body';
import type { SubjectSavePayload } from './subject-body';
import type { TransportHydrationRecords } from './subject-record';
import { c15tProtocolHeaders } from './version-header';

export interface HostedRecordTransportOptions {
	backendURL: string;
	fetch?: typeof globalThis.fetch;
	credentials?: RequestCredentials;
	domain?: string;
	now?: () => number;
}

export interface HostedDecisionSource {
	required: boolean;
	pending: () => Promise<unknown> | undefined;
	inputs: () => RememberedDecisionInputs | undefined;
}

export interface HostedRecordTransport extends KernelTransport {
	save: (payload: SubjectSavePayload) => Promise<SaveResult>;
	identify: (user: KernelUser, subjectId: string | null) => Promise<void>;
	loadSubjectRecord: (
		subjectId: string
	) => Promise<TransportHydrationRecords | null>;
}

export const trimSlash = function trimSlash(url: string): string {
	return url.endsWith('/') ? url.slice(0, -1) : url;
};

const resolveDomain = function resolveDomain(
	backendURL: string,
	explicit: string | undefined
): string {
	if (explicit) {
		return explicit;
	}
	if (typeof window !== 'undefined' && window.location?.hostname) {
		return window.location.hostname;
	}
	try {
		return new URL(backendURL).hostname;
	} catch {
		return 'localhost';
	}
};

const toSaveResult = function toSaveResult(data: unknown): SaveResult {
	const subjectId =
		typeof data === 'object' &&
		data !== null &&
		typeof (data as { subjectId?: unknown }).subjectId === 'string'
			? (data as { subjectId: string }).subjectId
			: undefined;
	return subjectId === undefined ? { ok: true } : { ok: true, subjectId };
};

export const resolveFetch = function resolveFetch(
	fetchImpl: typeof globalThis.fetch | undefined
): typeof globalThis.fetch {
	const resolved = fetchImpl ?? globalThis.fetch?.bind(globalThis);
	if (!resolved) {
		throw new Error(
			'createHostedTransport: no fetch available. Pass `fetch` in options.'
		);
	}
	return resolved;
};

export const createHostedRecordTransport = function createHostedRecordTransport(
	options: HostedRecordTransportOptions,
	decision?: HostedDecisionSource
): HostedRecordTransport {
	const base = trimSlash(options.backendURL);
	const fetchImpl = resolveFetch(options.fetch);
	const credentials = options.credentials ?? 'include';
	const domain = resolveDomain(base, options.domain);
	const now = options.now ?? Date.now;

	const jsonHeaders = {
		accept: 'application/json',
		'content-type': 'application/json',
		...c15tProtocolHeaders,
	};

	const subjectURL = (subjectId: string): string =>
		`${base}/subjects/${encodeURIComponent(subjectId)}`;

	const failed = function failed(
		route: string,
		response: Response
	): Promise<Error> {
		return failedResponseError(`c15t hosted transport: ${route}`, response);
	};

	return {
		async identify(user, subjectId): Promise<void> {
			if (!subjectId) {
				return;
			}
			const response = await fetchImpl(subjectURL(subjectId), {
				body: JSON.stringify({
					externalId: user.externalId,
					identityProvider: user.identityProvider,
					identityToken: user.identityToken,
				}),
				credentials,
				headers: jsonHeaders,
				method: 'PATCH',
			});
			if (response.status === 404 && isValidSubjectId(subjectId)) {
				return;
			}
			if (!response.ok) {
				throw await failed('/subjects/:id', response);
			}
		},

		async loadSubjectRecord(
			subjectId
		): Promise<TransportHydrationRecords | null> {
			const response = await fetchImpl(subjectURL(subjectId), {
				credentials,
				headers: { accept: 'application/json', ...c15tProtocolHeaders },
				method: 'GET',
			});
			if (response.status === 404) {
				return null;
			}
			if (!response.ok) {
				throw await failed('/subjects/:id', response);
			}
			const [
				body,
				{ mapSubjectRecordToHydrationRecords, reviveSubjectRecord },
			] = await Promise.all([response.json(), import('./subject-record')]);
			const record = reviveSubjectRecord(body);
			if (!record) {
				throw new Error(
					'c15t hosted transport: /subjects/:id returned an unreadable record'
				);
			}
			return mapSubjectRecordToHydrationRecords(record, { now: now() });
		},

		async save(payload): Promise<SaveResult> {
			if (
				decision?.required &&
				!payload.policySnapshotToken &&
				!payload.decisionInputs
			) {
				let awaited = decision.pending();
				while (awaited) {
					// oxlint-disable-next-line no-await-in-loop -- Each iteration waits for the init that superseded the last.
					await awaited.catch(() => undefined);
					awaited = decision.pending();
				}
				if (!buildDecisionAssertion(payload, decision.inputs())) {
					throw new Error(
						'c15t hosted transport: cannot save before init resolved a policy decision (assertDecisionInputs is set).'
					);
				}
			}

			const response = await fetchImpl(subjectsURL(base, payload.journey), {
				body: JSON.stringify({
					...buildSubjectPostBody(payload, { domain }),
					...buildDecisionAssertion(payload, decision?.inputs()),
				}),
				credentials,
				headers: jsonHeaders,
				method: 'POST',
			});

			if (!response.ok) {
				throw await saveFailure(response, 'c15t hosted transport');
			}

			return toSaveResult(await response.json());
		},
	};
};
