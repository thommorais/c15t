import { createHostedInitRequest } from '@c15t/core'
import type { HydrationRecords, KernelTransport, KernelUser, ProviderTransportFactory, SavePayload } from '@c15t/core'
import { validateExplicitChoice } from '@c15t/core/consent-record'
import {
	buildConfirmedChoiceWire,
	ConsentSaveRejectedError,
	custom,
	mapInitOutputToInitResponse,
	readProducerPolicyContract,
} from '@c15t/core/transports'
import type { InitOutput } from '@c15t/schema/types'

export interface SubjectProof {
	serverId?: string
	token: string
}

export interface SubjectProofStore {
	get(subjectId: string): SubjectProof | undefined
	set(subjectId: string, proof: SubjectProof): void
}

export interface GoTransportOptions {
	backendURL: string
	apiKey: string
	domain: string
	fetch?: typeof globalThis.fetch
	/** Override browser storage for SSR or another persistence boundary. */
	proofStore?: SubjectProofStore
}

// Construct one store per visitor/request on a server. Browsers retain their
// subject proof across reloads, independently from the public site API key.
export const createSubjectProofStore = (namespace: string): SubjectProofStore => {
	const memory = new Map<string, SubjectProof>()
	const key = (id: string) => `c15t:go:${namespace}:${id}`
	return {
		get(id) {
			try {
				const raw = globalThis.localStorage?.getItem(key(id))
				if (raw) {
					const value = JSON.parse(raw) as Partial<SubjectProof>
					if (
						typeof value.token === 'string' &&
						/^[a-f0-9]{64}$/u.test(value.token) &&
						(value.serverId === undefined || typeof value.serverId === 'string')
					)
						return value as SubjectProof
				}
			} catch {
				/* Storage may be unavailable in private browsing or SSR. */
			}
			return memory.get(id)
		},
		set(id, proof) {
			memory.set(id, proof)
			try {
				globalThis.localStorage?.setItem(key(id), JSON.stringify(proof))
			} catch {
				/* Keep same-page retries stable when storage is unavailable. */
			}
		},
	}
}

const newProof = (): SubjectProof => ({
	token: Array.from(crypto.getRandomValues(new Uint8Array(32)), value => value.toString(16).padStart(2, '0')).join(''),
})

export const createGoTransport = (options: GoTransportOptions): KernelTransport => {
	if (!/^c15t_(?:live|test)_pk_/u.test(options.apiKey))
		throw new Error('The Go browser transport requires a publishable API key.')
	if (!options.domain) throw new Error('The Go transport requires a site domain.')
	const base = options.backendURL.replace(/\/$/u, '')
	const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis)
	const proofs = options.proofStore ?? createSubjectProofStore(`${base}:${options.domain}`)
	const headers = { accept: 'application/json', Authorization: `Bearer ${options.apiKey}` }
	const request = async (path: string, init: RequestInit = {}, saving = false): Promise<Response> => {
		const response = await fetchImpl(`${base}${path}`, {
			...init,
			headers: { ...headers, ...init.headers },
			credentials: 'omit',
			cache: 'no-store',
		})
		if (!response.ok) {
			const detail = (await response.json().catch(() => ({}))) as { code?: string; message?: string }
			const message = detail.message ?? `Consent request failed (${response.status}).`
			if (saving && [400, 401, 403, 409, 422].includes(response.status))
				throw new ConsentSaveRejectedError({
					code: detail.code ?? 'INPUT_VALIDATION_FAILED',
					message,
					status: response.status,
				})
			throw Object.assign(new Error(message), { status: response.status, code: detail.code })
		}
		return response
	}
	const identify = async (user: KernelUser, id: string | null) => {
		const proof = id ? proofs.get(id) : undefined
		if (!proof?.serverId) return
		await request(
			`/subjects/${encodeURIComponent(proof.serverId)}`,
			{
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					externalId: user.externalId,
					identityProvider: user.identityProvider,
					subjectToken: proof.token,
				}),
			},
			true,
		)
	}
	return {
		async init(ctx) {
			const init = createHostedInitRequest({
				backendURL: base,
				overrides: ctx.overrides,
				journey: ctx.journey,
				experiment: ctx.experiment,
			})
			const path = init.url.slice(base.length)
			const response = await request(path, init.init)
			return mapInitOutputToInitResponse((await response.json()) as InitOutput, init.requestHeaders, {
				producerContract: readProducerPolicyContract(response.headers),
			})
		},
		async save(payload: SavePayload) {
			if (payload.model === 'iab' || payload.vendorChoice !== undefined)
				throw new ConsentSaveRejectedError({
					code: 'UNSUPPORTED_FEATURE',
					message: 'The Go transport currently stores category choices only.',
					status: 400,
				})
			const proof = proofs.get(payload.subjectId) ?? newProof()
			// Save before the request. A lost response must replay the same client
			// ID and proof, so Go finds the same subject and consent submission.
			proofs.set(payload.subjectId, proof)
			const choice = buildConfirmedChoiceWire(payload)
			if (!choice)
				throw new ConsentSaveRejectedError({
					code: 'INPUT_VALIDATION_FAILED',
					message: 'The Go transport requires v3 category receipts.',
					status: 400,
				})
			const response = await request(
				'/consent',
				{
					method: 'POST',
					headers: {
						'content-type': 'application/json',
						...(payload.overrides.gpc !== undefined && { 'x-c15t-gpc': payload.overrides.gpc ? '1' : '0' }),
						...(payload.overrides.country && { 'x-c15t-country': payload.overrides.country }),
						...(payload.overrides.region && { 'x-c15t-region': payload.overrides.region }),
						...(payload.overrides.language && { 'accept-language': payload.overrides.language }),
					},
					body: JSON.stringify({
						...(proof.serverId ? { subjectId: proof.serverId } : { clientSubjectId: payload.subjectId }),
						subjectToken: proof.token,
						domain: options.domain,
						policyType: 'cookie_banner',
						givenAt: new Date(payload.confirmed.actionAt).toISOString(),
						action: { all: 'accept_all', necessary: 'reject_all', custom: 'custom' }[payload.consentAction],
						uiSource: payload.uiSource,
						policySnapshotToken: payload.policySnapshotToken,
						choice,
						metadata: {
							...(payload.experiment && { experiment: payload.experiment }),
							...(payload.user?.properties && { userProperties: payload.user.properties }),
							...(payload.timeToDecisionMs !== undefined && { timeToDecisionMs: payload.timeToDecisionMs }),
						},
					}),
				},
				true,
			)
			const result = (await response.json()) as { subjectId: string }
			proofs.set(payload.subjectId, { ...proof, serverId: result.subjectId })
			if (payload.user) await identify(payload.user, payload.subjectId)
			// Keep the kernel's stable ID. PocketBase IDs stay behind the adapter.
			return { ok: true, subjectId: payload.subjectId }
		},
		identify,
		async loadSubjectRecord(id): Promise<HydrationRecords | null> {
			const proof = proofs.get(id)
			if (!proof?.serverId) return null
			const response = await request(`/subjects/${encodeURIComponent(proof.serverId)}/record`, {
				headers: { 'X-C15T-Subject-Token': proof.token },
			})
			const record = (await response.json()) as {
				subjectChoice: unknown
				externalId?: string
				identityProvider?: string
			}
			const now = Date.now()
			const choice = record.subjectChoice === null ? null : validateExplicitChoice(record.subjectChoice, now)
			if (choice !== null && !choice.ok) throw new Error('The Go backend returned invalid category receipts.')
			return {
				now,
				choice: choice?.record ?? null,
				subject: { subjectId: id, externalId: record.externalId, identityProvider: record.identityProvider },
			}
		},
	}
}

/** Mount with ConsentProvider options.mode. Each call owns one visitor's proof store. */
export const go = (options: GoTransportOptions): ProviderTransportFactory => custom(createGoTransport(options))
