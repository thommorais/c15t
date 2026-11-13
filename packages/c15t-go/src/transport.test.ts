import { afterAll, beforeAll, expect, test } from 'vitest'
import { createEvaluationPolicy, evaluateConsentRecord } from '@c15t/core/consent-record'
import type { ExplicitChoice, SavePayload } from '@c15t/core'
import { readPolicyResolutionWire } from '@c15t/schema/types'
import { startGoServer } from '../../../scripts/go-test-server.mjs'
import { createGoTransport } from './index'
import type { SubjectProof, SubjectProofStore } from './index'

let server: Awaited<ReturnType<typeof startGoServer>>
beforeAll(async () => {
	server = await startGoServer()
})
afterAll(async () => {
	await server?.close()
})

const withOrigin: typeof fetch = (input, init) => {
	const headers = new Headers(init?.headers)
	headers.set('Origin', 'https://shop.example')
	return fetch(input, { ...init, headers })
}
const store = (): SubjectProofStore => {
	const values = new Map<string, SubjectProof>()
	return {
		get: id => values.get(id),
		set: (id, proof) => {
			values.set(id, proof)
		},
	}
}

test('real Go init, partial saves, readback, and evaluator retain explicit denials and receipt times', async () => {
	const proofs = store()
	const transport = createGoTransport({ ...server, domain: 'shop.example', fetch: withOrigin, proofStore: proofs })
	const init = await transport.init!({ overrides: { country: 'DE', gpc: true }, user: null })
	const resolution = readPolicyResolutionWire(init.policyResolution)
	expect(resolution.status).toBe('matched')
	if (resolution.status !== 'matched') throw new Error('Expected a matched rule')
	expect(init.location?.countryCode).toBe('DE')
	expect(init.resolvedPrivacySignals?.gpc).toBe(true)
	const at = Date.now() - 60_000
	const receipt = (value: boolean, confirmedAt: number) => ({
		value,
		confirmedAt,
		basis: { kind: 'choice-v1' as const, fingerprint: resolution.fingerprints.choice },
	})
	const initial: ExplicitChoice = {
		version: 3,
		categories: { marketing: receipt(true, at), measurement: receipt(true, at) },
	}
	const payload: SavePayload = {
		subjectId: 'sub_integration_receipts_12345',
		subject: {},
		choice: initial,
		confirmed: { actionAt: at, categories: { marketing: true, measurement: true } },
		consents: { necessary: true, marketing: false, measurement: true, functionality: false, experience: false },
		overrides: { country: 'DE', gpc: true },
		user: null,
		model: 'opt-in',
		uiSource: 'banner',
		consentAction: 'all',
		policySnapshotToken: init.policySnapshotToken ?? null,
	}
	expect(await transport.save!(payload)).toEqual({ ok: true, subjectId: payload.subjectId })
	const later = at + 10_000
	await transport.save!({
		...payload,
		choice: { version: 3, categories: { ...initial.categories, marketing: receipt(false, later) } },
		confirmed: { actionAt: later, categories: { marketing: false } },
		consentAction: 'custom',
	})
	const records = await transport.loadSubjectRecord!(payload.subjectId)
	expect(records?.choice?.categories.marketing).toEqual(receipt(false, later))
	expect(records?.choice?.categories.measurement).toEqual(receipt(true, at))
	const rule = resolution.policy
	const policy = createEvaluationPolicy({
		model: rule.model,
		prompt: rule.prompt,
		scope: rule.scope,
		scopeMode: rule.scopeMode,
		choice: { fingerprint: resolution.fingerprints.choice, maxAgeMs: rule.validity.choiceMs },
		notice: { fingerprint: resolution.fingerprints.notice, maxAgeMs: rule.validity.noticeMs },
		gpcDenyCategories: rule.privacySignals.gpc.denyCategories,
	})
	const evaluation = evaluateConsentRecord({
		choice: records?.choice ?? null,
		noticeDismissal: null,
		policy,
		now: Date.now(),
		gpc: false,
	})
	expect(evaluation.permissions.marketing).toBe(false)
	expect(evaluation.permissions.measurement).toBe(true)
	await transport.identify!({ externalId: 'integration-user' }, payload.subjectId)
	expect((await transport.loadSubjectRecord!(payload.subjectId))?.subject?.externalId).toBe('integration-user')
	await expect(transport.identify!({ externalId: 'somebody-else' }, payload.subjectId)).rejects.toThrow()
	const proof = proofs.get(payload.subjectId)!
	const forbidden = await withOrigin(`${server.backendURL}/subjects/${proof.serverId}/record`, {
		headers: { Authorization: `Bearer ${server.apiKey}`, 'X-C15T-Subject-Token': 'b'.repeat(64) },
	})
	expect(forbidden.status).toBe(403)
})

test('a lost first response retries the same subject and submission', async () => {
	const proofs = store()
	let lose = true
	const unreliable: typeof fetch = async (input, init) => {
		const response = await withOrigin(input, init)
		if (lose && init?.method === 'POST') {
			lose = false
			await response.text()
			throw new TypeError('Lost response')
		}
		return response
	}
	const transport = createGoTransport({ ...server, domain: 'shop.example', fetch: unreliable, proofStore: proofs })
	const init = await transport.init!({ overrides: { country: 'DE' }, user: null })
	const resolution = readPolicyResolutionWire(init.policyResolution)
	if (resolution.status !== 'matched') throw new Error('Expected a matched rule')
	const at = Date.now() - 1_000
	const payload: SavePayload = {
		subjectId: 'sub_integration_retry_123456',
		subject: {},
		choice: {
			version: 3,
			categories: {
				marketing: {
					value: false,
					confirmedAt: at,
					basis: { kind: 'choice-v1', fingerprint: resolution.fingerprints.choice },
				},
			},
		},
		confirmed: { actionAt: at, categories: { marketing: false } },
		consents: { necessary: true, marketing: false, measurement: false, functionality: false, experience: false },
		overrides: { country: 'DE' },
		user: null,
		model: 'opt-in',
		uiSource: 'banner',
		consentAction: 'necessary',
		policySnapshotToken: init.policySnapshotToken ?? null,
	}
	await expect(transport.save!(payload)).rejects.toThrow('Lost response')
	const reloaded = createGoTransport({ ...server, domain: 'shop.example', fetch: withOrigin, proofStore: proofs })
	await expect(reloaded.save!(payload)).resolves.toEqual({ ok: true, subjectId: payload.subjectId })
	const proof = proofs.get(payload.subjectId)!
	const response = await fetch(`${server.backendURL}/consent/${proof.serverId}`, {
		headers: { Authorization: `Bearer ${server.secretKey}` },
	})
	expect((await response.json()).consents).toHaveLength(1)
})

test('secret keys cannot enter the browser transport and wrong origins cannot initialize', async () => {
	expect(() => createGoTransport({ ...server, apiKey: server.secretKey, domain: 'shop.example' })).toThrow(
		'publishable',
	)
	const transport = createGoTransport({
		...server,
		domain: 'shop.example',
		fetch: (input, init) => fetch(input, { ...init, headers: { ...init?.headers, Origin: 'https://wrong.example' } }),
	})
	await expect(transport.init!({ overrides: {}, user: null })).rejects.toThrow('Origin')
})
