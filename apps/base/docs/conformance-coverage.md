# TS to Go test coverage

Source: TS tests in /Users/thommorais/shed/c15t (packages/backend, packages/schema). One row per it/test case, table rows expanded. Judged on behaviour, not wire shape. Each COVERED row names the Go test that asserts it; a sample of cited test names was checked against the Go source. Tracked by folio ticket 805ydvhqv171f1q.

| Group | Rows | Covered | Partial | Not covered | Missing in Go | N/A |
|---|---|---|---|---|---|---|
| Subject handlers | 101 | 18 | 16 | 18 | 19 | 30 |
| Init and policy | 240 | 115 | 38 | 39 | 34 | 14 |
| Db registry and legal documents | 127 | 20 | 38 | 17 | 20 | 32 |
| Middleware, edge and utils | 197 | 34 | 18 | 14 | 14 | 117 |
| Total | 665 | 187 | 110 | 88 | 87 | 193 |

Not covered: Go has the behaviour, no test. Missing in Go: Go lacks the behaviour.

## Subject handlers

Coverage of TS subject/status/enrichment tests against the Go port (apps/base). Static read only, nothing was run except a stdlib check that a JSON number does not decode into time.Time.

Go test names are in api/api_test.go unless a path is given. Go decision key = core/consent.DedupeKey, Go submission identity = core/consent.SubmissionKey (sha256 over tenant, subject, domain, policy type, givenAt), stored in consent.submissionKey with a unique index.

Observation outside any TS test, UNVERIFIED by a Go test: api/store.go insertConsent sets consent.policy from the deduped runtimePolicyDecision row, and the decision key (core/consent DedupeKey) has no policy id or hash. A consent that names an explicit policyId or policyHash may therefore be stored against the policy of an earlier decision row with the same key. Read from source, not reproduced.

## post.handler.test.ts

| TS file | test name | behaviour asserted (one line) | Go status | Go test or source |
|---|---|---|---|---|
| post.handler.test.ts | buildRuntimeDecisionDedupeKey: changes when the rendered language changes | decision dedupe key differs for en vs de | NOT COVERED | DecisionKey has a Language field hashed in DedupeKey, but TestDedupeKeyIsStableAndScoped has no language variant, and api/store.go upsertDecision never sets Language |
| post.handler.test.ts | buildRuntimeDecisionDedupeKey: stays stable for the same rendered language | same inputs give same key | PARTIAL | TestDedupeKeyIsStableAndScoped (core/consent) asserts stability, with Language left empty |
| post.handler.test.ts | buildConsentId: stays stable for identical consent submissions | same identity gives same id | COVERED | TestSubmissionKeyIsStableAndScoped (core/consent) asserts SubmissionKey(base) twice is equal |
| post.handler.test.ts | buildConsentId: produces a prefixed base58 id in the same shape as random ids | id matches cns_ plus base58 | N/A | Go keys are 64 hex sha256 in submissionKey, record ids are PocketBase ids; id shape is wire only |
| post.handler.test.ts | buildConsentId: changes when the tenant changes | tenant alters id | COVERED | TestSubmissionKeyIsStableAndScoped variant "tenant" |
| post.handler.test.ts | buildConsentId: changes when the subject changes | subject alters id | COVERED | TestSubmissionKeyIsStableAndScoped variant "subject" |
| post.handler.test.ts | buildConsentId: changes when the domain changes | domain alters id | COVERED | TestSubmissionKeyIsStableAndScoped variant "domain" |
| post.handler.test.ts | buildConsentId: changes when the policy changes | policy id alters id | PARTIAL | Go key uses policy type, not policy id or version (variant "policy type" only), so two submissions against different policy versions of one type collapse into one |
| post.handler.test.ts | buildConsentId: changes when the givenAt changes | 1 ms difference alters id | COVERED | TestSubmissionKeyIsStableAndScoped variant "given at" (1 s step, RFC3339Nano in key) |
| post.handler.test.ts | buildConsentId: distinguishes a missing tenant from a tenant named "default" | undefined tenant differs from "default" | NOT COVERED | SubmissionKey joins TenantID with \x1f so "" and "default" differ, no test |
| post.handler.test.ts | buildConsentId: orders ids chronologically by givenAt | earlier id sorts before later id | N/A | Go submission key is a hash and record ids are random; ordering is by givenAt on read (not by id) |
| post.handler.test.ts | givenAt clamping: records server time when the client clock runs far ahead | far-future givenAt stored as server time, warn logged | PARTIAL | TestConsentClientTime "far future is clamped to server time" and TestClampGivenAt assert the clamp; Go emits no warn log |
| post.handler.test.ts | givenAt clamping: keeps the consent id stable across retries of a clamped submission | retries of a clamped submission yield the same id | MISSING IN GO | api/store.go insertConsent builds SubmissionKey from rec.GivenAt, which is the clamped time, so each retry of a far-future givenAt writes a new row |
| post.handler.test.ts | givenAt clamping: finds a pre-deterministic row by the raw timestamp after clamping | legacy random-id row found via raw timestamp | N/A | Rolling-deploy legacy rows; the Go port has none |
| post.handler.test.ts | givenAt clamping: keeps the client's original claim on the record when clamped | metadata.clientGivenAt holds the raw client value | MISSING IN GO | No clientGivenAt anywhere in apps/base (grep) |
| post.handler.test.ts | givenAt clamping: does not annotate metadata when the timestamp is within tolerance | givenAt +300000 ms kept, no annotation, no warn | PARTIAL | TestClampGivenAt "exactly at the tolerance is preserved"; no annotation or warn exists in Go so absence is not asserted |
| post.handler.test.ts | idempotency: should return existing consent on duplicate submission | duplicate returns the existing consent, no new write | COVERED | TestConsentIsIdempotent (201 then 200, same id, duplicate true, 1 consent row, 1 auditLog row) |
| post.handler.test.ts | idempotency: should create new consent when no duplicate exists | fresh submission creates a consent | COVERED | TestConsentWrite and first call of TestConsentIsIdempotent (201) |
| post.handler.test.ts | idempotency: checks legacy rows after a deterministic lookup misses | second lookup for legacy random-id rows | N/A | Legacy rows; none in Go |
| post.handler.test.ts | idempotency: falls back to submission fields for a legacy random-id record | legacy row matched by subject, domain, policy, givenAt | N/A | Legacy rows; none in Go |
| post.handler.test.ts | idempotency: scopes the legacy fallback to the current tenant | legacy lookup filtered by tenant | N/A | Legacy rows; tenant scoping of the Go key is covered by TestSubmissionKeyIsStableAndScoped "tenant" |
| post.handler.test.ts | idempotency: should return existing consent when a concurrent insert wins the race | unique violation on insert returns the winner | NOT COVERED | api/store.go insertConsent re-finds by submissionKey after a failed Save; unique index idx_consent_submission exists; no test forces the conflict |
| post.handler.test.ts | idempotency: should retry the transaction when the winning record is not yet visible | retry insert when winner not visible | MISSING IN GO | Single attempt in recordConsent, no retry loop |
| post.handler.test.ts | idempotency: should not retry or swallow non-unique-constraint errors | non-conflict DB error surfaces after one attempt | NOT COVERED | insertConsent returns the Save error when no existing row is found; no test injects a DB failure on consent save |
| post.handler.test.ts | idempotency: should give up after exhausting retries on a persistent conflict | bounded retries, then error | MISSING IN GO | No retry loop to bound |
| post.handler.test.ts | idempotency: should write the consent record under a deterministic id | stored id derives from identity, no dedupeKey column | PARTIAL | Go stores the deterministic value in submissionKey (TestSubmissionKeyIsStableAndScoped, TestConsentIsIdempotent); no test reads the stored submissionKey off the row |
| post.handler.test.ts | idempotency: should create separate records for different givenAt timestamps | different givenAt gives separate rows | COVERED | TestConsentDistinctSubmissionsAreSeparate (givenAt +1 s gives a separate row; also domain, subject, policyType) |
| post.handler.test.ts | idempotency: should persist metadata and uiSource in consent record | metadata and uiSource saved on the row | NOT COVERED | insertConsent sets uiSource and metadata; TestConsentWrite sends uiSource but asserts neither stored value; no test sends metadata |
| post.handler.test.ts | idempotency: should include uiSource in response for new consent | response echoes uiSource | N/A | consentResponse has no uiSource field; wire shape only |
| post.handler.test.ts | idempotency: should include uiSource in response for duplicate consent | duplicate response echoes uiSource | N/A | Same, wire shape only |
| post.handler.test.ts | idempotency: should omit metadata from consent record when not provided | metadata unset when absent | NOT COVERED | insertConsent only sets metadata when non-nil; no test |
| post.handler.test.ts | idempotency: should not record metrics for duplicate submissions | no metrics on duplicate | N/A | Telemetry; Go has no metrics |
| post.handler.test.ts | policy purpose enforcement: rejects preferences that include disallowed categories | strict scope rejects out-of-scope category with 400, nothing written | COVERED | TestConsentStrictScopeRejectsOutOfScope (400), TestBuildStrictScopeRejectsOutOfScope (core/consent), TestErrorEnvelope "category outside the policy" (PURPOSE_NOT_ALLOWED); message text and no-row assertion not made for this case |
| post.handler.test.ts | policy purpose enforcement: allows necessary preferences in strict scope even when omitted from policy categories | necessary always allowed under strict | MISSING IN GO | core/consent checkScope has no necessary exemption; every strict test lists necessary in the allowlist |
| post.handler.test.ts | policy purpose enforcement: passes top-level iabEnabled into write-time policy resolution | iabEnabled forwarded to resolver | N/A | IAB out of scope |
| post.handler.test.ts | policy purpose enforcement: rejects missing policy snapshot tokens when reject mode is active | 409 POLICY_SNAPSHOT_REQUIRED, nothing written | COVERED | TestErrorEnvelope "required snapshot missing" (409 and code); TestSnapshotRequiredRejectsBadTokens "missing"; message and no-write not asserted |
| post.handler.test.ts | policy purpose enforcement: rejects invalid policy snapshot tokens when reject mode is active | 409 POLICY_SNAPSHOT_INVALID | COVERED | TestErrorEnvelope "required snapshot malformed" (409 and code); TestSnapshotRequiredRejectsBadTokens "malformed" and "tampered" (409 only) |
| post.handler.test.ts | policy purpose enforcement: rejects expired policy snapshot tokens when reject mode is active | 409 POLICY_SNAPSHOT_EXPIRED | COVERED | TestErrorEnvelope "expired snapshot" (409 and code) |
| post.handler.test.ts | policy purpose enforcement: falls back to the current policy decision when resolve_current mode is active | invalid token falls back to current policy, decision stored with source write_time_fallback | PARTIAL | TestSnapshotOptionalFallsBackToCurrentPolicy asserts 201 only; Go always writes runtimePolicySource "runtime", no fallback marker, stored decision not asserted |
| post.handler.test.ts | policy purpose enforcement: rejects /subjects writes when policy resolution fails IAB validation | resolver IAB error gives 500, nothing written | N/A | IAB out of scope |
| post.handler.test.ts | policy purpose enforcement: persists out-of-scope categories when scopeMode is permissive | permissive scope stores out-of-scope purposes | PARTIAL | TestBuildScopeAllowances "permissive allows out of scope" (core/consent); no API test asserts purposes rows for an out-of-scope category |
| post.handler.test.ts | policy purpose enforcement: returns submitted preferences for necessary-only permissive policies | permissive necessary-only policy accepts extra categories, response lists applied preferences | PARTIAL | Same core test; Go response has no appliedPreferences (wire shape) and no API test covers this policy |
| post.handler.test.ts | policy purpose enforcement: allows all purposes when policy uses wildcard scope | wildcard categories accept any purpose | PARTIAL | TestBuildScopeAllowances "strict wildcard allows anything" (core/consent); purpose rows under wildcard not asserted at API level |
| post.handler.test.ts | policy purpose enforcement: prioritizes valid snapshot wildcard scope over restrictive write-time policy | valid snapshot scope overrides current policy | MISSING IN GO | api/snapshot.go verifySnapshot only compares payload.Fingerprint to the current decision; snapshot categories are never applied |
| post.handler.test.ts | policy purpose enforcement: persists runtime policy i18n and preselected categories from write-time fallback | decision row stores language, policyI18n, preselectedCategories | NOT COVERED | store.go upsertDecision sets preselectedCategories, policyI18n, language; no test reads runtimePolicyDecision fields |
| post.handler.test.ts | policy purpose enforcement: persists runtime policy i18n and preselected categories from a valid snapshot | same values taken from the snapshot payload | MISSING IN GO | Snapshot payload is not used for persistence |
| post.handler.test.ts | policy purpose enforcement: persists runtime policy scrollLock in audit records | decision row stores banner and dialog UI incl. scrollLock | NOT COVERED | upsertDecision stores ui.Banner and ui.Dialog as bannerUi and dialogUi; no test reads them (TestSnapshotPayloadCarriesPolicyDetail checks the token payload only) |
| post.handler.test.ts | legal document snapshots: rejects legal document consent without token, policyId, or policyHash when verification is disabled | 409 LEGAL_DOCUMENT_PROOF_REQUIRED | COVERED | TestConsentPolicyType "legal document without proof" (409), TestErrorEnvelope "legal document consent without proof" (409 and code) |
| post.handler.test.ts | legal document snapshots: treats a suffixed legal-document type as legal document consent | terms_and_conditions_b2b is a legal document, 409 token required with verification on | PARTIAL | TestConsentPolicyType "suffixed legal document without proof" (409, verification off); with a signer configured Go requires no document token (see TestLegalDocumentConsentAllowedWithSnapshotSigner) |
| post.handler.test.ts | legal document snapshots: rejects missing legal document snapshot tokens when verification is enabled | 409 LEGAL_DOCUMENT_SNAPSHOT_REQUIRED | MISSING IN GO | requireLegalDocumentProof (api/policyref.go) waives proof whenever h.signer != nil; TestLegalDocumentConsentAllowedWithSnapshotSigner asserts 201 without any token |
| post.handler.test.ts | legal document snapshots: rejects invalid legal document snapshot tokens when verification is enabled | 409 LEGAL_DOCUMENT_SNAPSHOT_INVALID | MISSING IN GO | No legal document token verifier |
| post.handler.test.ts | legal document snapshots: rejects expired legal document snapshot tokens when verification is enabled | 409 LEGAL_DOCUMENT_SNAPSHOT_EXPIRED | MISSING IN GO | No legal document token verifier |
| post.handler.test.ts | legal document snapshots: rejects legal document snapshot tokens whose type does not match the request | token type mismatch gives 409 invalid | MISSING IN GO | No legal document token verifier |
| post.handler.test.ts | legal document snapshots: accepts explicit policyId for legal document consent when verification is disabled | explicit policyId accepted and used | PARTIAL | TestLegalDocumentConsentAcceptsExplicitPolicyID asserts 201 only, not that the stored consent references that policy (see observation at top) |
| post.handler.test.ts | legal document snapshots: creates consent against the token-backed legal document policy | valid document token creates policy, skips runtime policy decision | MISSING IN GO | No document token path; recordConsent always resolves a runtime policy and calls upsertDecision, including for legal documents |

## post.handler.integration.test.ts

| TS file | test name | behaviour asserted (one line) | Go status | Go test or source |
|---|---|---|---|---|
| post.handler.integration.test.ts | recovers a real PK conflict and keeps concurrent submissions idempotent | real unique-violation recovered, concurrent identical submissions share one row, retry and distinct givenAt behave | PARTIAL | TestConsentIsIdempotent and TestConsentDistinctSubmissionsAreSeparate cover sequential repeat and distinct rows; no test forces a unique conflict or submits concurrently; the unique index idx_consent_submission and the re-find in insertConsent are untested |

## consent-time.test.ts

| TS file | test name | behaviour asserted (one line) | Go status | Go test or source |
|---|---|---|---|---|
| consent-time.test.ts | clampConsentGivenAt: clamps timestamps beyond the drift window to server time | now+300001 ms becomes now | COVERED | TestClampGivenAt "just past the tolerance is clamped" (core/consent, +5m1s) |
| consent-time.test.ts | clampConsentGivenAt: preserves timestamps at the edge of the drift window | now+300000 ms kept | COVERED | TestClampGivenAt "exactly at the tolerance is preserved" |
| consent-time.test.ts | clampConsentGivenAt: preserves past timestamps for offline replay | 30 day old time kept | COVERED | TestClampGivenAt "past is preserved" (72 h), TestConsentClientTime "past timestamp is preserved" |

## list.handler.test.ts

| TS file | test name | behaviour asserted (one line) | Go status | Go test or source |
|---|---|---|---|---|
| list.handler.test.ts | listSubjectsHandler: skips consent and enrichment queries when no subjects match | empty result and one query only | PARTIAL | TestListSubjects asserts an empty list for an unknown externalId; query count not asserted |
| list.handler.test.ts | listSubjectsHandler: batches 2 subjects with 1 consents each into five queries | batched queries, each subject carries its consents | MISSING IN GO | api/subject.go listSubjects calls enrichConsents per subject, which runs FindAll plus per-consent FindByID; TestListSubjects seeds one subject and does not assert consent counts |
| list.handler.test.ts | listSubjectsHandler: batches 100 subjects with 3 consents each into five queries | same at 100 x 3 | MISSING IN GO | Same, N+1 queries; no multi-subject test |
| list.handler.test.ts | listSubjectsHandler: queries large subject lists in bounded batches | 501 subjects queried in chunks of 500 | MISSING IN GO | No chunking |
| list.handler.test.ts | listSubjectsHandler: bounds concurrent GET workload to one acquisition per request | one pool connection per request under a constrained pool | N/A | Postgres pool semantics; Go runs on PocketBase SQLite. Go does issue many sequential queries per request (see batching rows) |
| list.handler.test.ts | listSubjectsHandler: has no checked-out or queued work after a query fails | pool drained and 500 after a failed query | N/A | Postgres pool semantics; Go surfaces a failed query as 500 via respondError, covered generically by TestUnexpectedErrorsDoNotLeak |

## schema/post.test.ts

Go decodes givenAt as RFC3339 into *time.Time (api/routes.go consentRequest), the TS schema takes epoch milliseconds. Checked with a stdlib json.Unmarshal: a JSON number fails to decode into time.Time, so a malformed value becomes 400 INPUT_VALIDATION_FAILED through BindBody in api/route.go.

| TS file | test name | behaviour asserted (one line) | Go status | Go test or source |
|---|---|---|---|---|
| post.test.ts | postSubjectInputSchema givenAt: accepts a normal epoch millisecond timestamp | valid epoch ms accepted | N/A | Wire shape: Go takes RFC3339 (TestConsentIsIdempotent sends one) |
| post.test.ts | postSubjectInputSchema givenAt: accepts the maximum timestamp Date can represent | 8.64e15 accepted | N/A | Wire shape, epoch ms |
| post.test.ts | postSubjectInputSchema givenAt: accepts the minimum timestamp Date can represent | -8.64e15 accepted | N/A | Wire shape, epoch ms |
| post.test.ts | postSubjectInputSchema givenAt: accepts the unix epoch | 0 accepted | N/A | Wire shape, epoch ms |
| post.test.ts | postSubjectInputSchema givenAt: accepts a fractional timestamp | fractional ms accepted | N/A | Wire shape, epoch ms |
| post.test.ts | postSubjectInputSchema givenAt: rejects a beyond the Date range timestamp | 8.64e15+1 rejected | NOT COVERED | Go rejects any non-RFC3339 givenAt with 400; no test sends a bad givenAt |
| post.test.ts | postSubjectInputSchema givenAt: rejects a below the Date range timestamp | -8.64e15-1 rejected | NOT COVERED | Same |
| post.test.ts | postSubjectInputSchema givenAt: rejects a absurdly large timestamp | 1e18 rejected | NOT COVERED | Same |
| post.test.ts | postSubjectInputSchema givenAt: rejects a NaN timestamp | NaN rejected | N/A | NaN is not representable in JSON |
| post.test.ts | postSubjectInputSchema givenAt: rejects a Infinity timestamp | Infinity rejected | N/A | Infinity is not representable in JSON |
| post.test.ts | postSubjectInputSchema givenAt: rejects a timestamp that Date would otherwise turn invalid | 1e18 rejected because new Date(1e18) is invalid | NOT COVERED | Same as the 1e18 row |

## consent-enrichment.test.ts

Go enrichment is api/subject.go enrichConsents (GET subject and list subjects). resolveConsentPolicies maps to checkConsent in api/routes.go. Go enrichedItem has no preferences, policyHash or policyEffectiveDate fields.

| TS file | test name | behaviour asserted (one line) | Go status | Go test or source |
|---|---|---|---|---|
| consent-enrichment.test.ts | parsePurposeIds: extracts IDs from { json: [...] } wrapper | unwrap ORM JSON column | N/A | ORM JSON wrapper; Go stores purposes as a relation |
| consent-enrichment.test.ts | parsePurposeIds: passes through raw string[] | array passthrough | N/A | ORM JSON wrapper |
| consent-enrichment.test.ts | parsePurposeIds: returns [] for null | null gives empty | N/A | ORM JSON wrapper |
| consent-enrichment.test.ts | parsePurposeIds: returns [] for undefined | undefined gives empty | N/A | ORM JSON wrapper |
| consent-enrichment.test.ts | parsePurposeIds: returns [] for empty array | empty gives empty | N/A | ORM JSON wrapper |
| consent-enrichment.test.ts | parsePurposeIds: returns [] for empty { json: [] } | empty wrapper gives empty | N/A | ORM JSON wrapper |
| consent-enrichment.test.ts | parsePurposeIds: returns [] for non-array values | string and number give empty | N/A | ORM JSON wrapper |
| consent-enrichment.test.ts | enrichConsents: returns [] for empty consents | no consents, no DB calls | NOT COVERED | enrichConsents returns an empty slice; no test fetches a subject with zero consents |
| consent-enrichment.test.ts | enrichConsents: enriches a single consent with policy and purposes | type, policy fields, isLatestPolicy, preferences map | PARTIAL | TestGetSubject asserts type and isLatestPolicy; Go returns no preferences, so purposes enrichment is MISSING IN GO; policyVersion not asserted |
| consent-enrichment.test.ts | enrichConsents: includes legal-document evidence fields when available | policyVersion, policyHash, policyEffectiveDate on item | MISSING IN GO | enrichedItem has policyVersion only |
| consent-enrichment.test.ts | enrichConsents: uses batch findMany with "in" operator (not N individual calls) | two batched queries | MISSING IN GO | enrichConsents issues FindAll plus FindByID per consent and FindFirst per type |
| consent-enrichment.test.ts | enrichConsents: sets type = "unknown" and isLatestPolicy = false for null policyId | null policy gives unknown type | MISSING IN GO | Go defaults the type to cookie_banner (consent.DefaultPolicyType) when the policy is missing; consent.policy is a required relation in the migration |
| consent-enrichment.test.ts | enrichConsents: isLatestPolicy is false when consent has an older policy | older policy gives false | NOT COVERED | enrichConsents compares to the active policy id; TestGetSubject asserts only true |
| consent-enrichment.test.ts | enrichConsents: handles { json: [...] } wrapper for purposeIds | wrapper unwrapped into preferences | N/A | ORM JSON wrapper |
| consent-enrichment.test.ts | enrichConsents: skips purposes not found in DB | missing purpose omitted from preferences | N/A | No preferences output in Go; purposes are relations |
| consent-enrichment.test.ts | enrichConsents: leaves preferences undefined when purposeIds is empty | no preferences key | MISSING IN GO | No preferences field in enrichedItem |
| consent-enrichment.test.ts | enrichConsents: does not call findMany for policies when no consents have policyId | skip policy query | NOT COVERED | enrichConsents skips FindByID when policy is empty; no test |
| consent-enrichment.test.ts | resolveConsentPolicies: returns [] for empty consents | no consents gives nothing | COVERED | TestCheckConsentUnknownExternalIDIsAllFalse (every requested type false) |
| consent-enrichment.test.ts | resolveConsentPolicies: returns correct policy info with isLatestPolicy | consent resolves to type and isLatestPolicy true | COVERED | TestCheckConsentReportsExistingConsent (hasConsent and isLatestPolicy true for cookie_banner) |
| consent-enrichment.test.ts | resolveConsentPolicies: returns unknown type for null policyId | null policy gives unknown, not latest | NOT COVERED | checkConsent skips consents with an empty policy; no test |
| consent-enrichment.test.ts | resolveConsentPolicies: does not load purposes (no consentPurpose findMany call) | no purpose query | N/A | Query-count internals; checkConsent never reads purposes |
| consent-enrichment.test.ts | resolveConsentPolicies: handles multiple consents with different policy types | per-type latest flag, older policy false | NOT COVERED | checkConsent computes latestByType per type; TestCheckConsentReportsExistingConsent uses one consent and never asserts isLatestPolicy false |

## status.handler.test.ts

| TS file | test name | behaviour asserted (one line) | Go status | Go test or source |
|---|---|---|---|---|
| status.handler.test.ts | statusHandler: should return health info when database is working | version, timestamp, client ip, language, user agent, region, DB probe | PARTIAL | TestStatus asserts version, timestamp, masked ip (TS returns raw ip, Go masks by design) and countryCode; userAgent, acceptLanguage and regionCode not asserted |
| status.handler.test.ts | statusHandler: should throw HTTPException when database query fails | DB failure gives 503 and logs | PARTIAL | TestUnavailableCarriesItsCodeAndHidesTheCause (api/errors_internal_test.go) asserts the 503 SERVICE_UNAVAILABLE envelope by calling respondError directly; the status handler failing on a real DB error and the log are not exercised |
| status.handler.test.ts | statusHandler: should handle missing geo headers | no geo headers gives null country and region | NOT COVERED | statusPayload omits empty fields via omitempty; no status test without geo headers (TestInitGeoDisabledFallsBackToGDPR covers init, not status) |

## Counts

COVERED 18, PARTIAL 16, NOT COVERED 18, MISSING IN GO 19, N/A 30, UNVERIFIED 0. Total 101 rows.

## Init and policy

# Coverage: init, policy and snapshot TS tests vs Go port

## schema/src/shared/policy-runtime.test.ts

| TS file | test name | behaviour asserted (one line) | Go status | Go test or source |
|---|---|---|---|---|
| policy-runtime.test.ts | computes the expected sha256 for empty string | sha256 hex of input equals golden vector | COVERED | core/policy/fingerprint_test.go TestSHA256Hex/empty |
| policy-runtime.test.ts | computes the expected sha256 for short ascii | sha256 hex of input equals golden vector | COVERED | core/policy/fingerprint_test.go TestSHA256Hex/short ascii |
| policy-runtime.test.ts | computes the expected sha256 for long policy-like json | sha256 hex of input equals golden vector | COVERED | core/policy/fingerprint_test.go TestSHA256Hex/long policy-like json |
| policy-runtime.test.ts | produces consistent hashes with crypto.subtle available | WebCrypto path hashes to the golden value | N/A | TS internals: WebCrypto vs pure-JS strategy; Go has one sha256 path |
| policy-runtime.test.ts | falls back to pure-JS when globalThis.crypto is unavailable | pure-JS fallback hashes to the golden value | N/A | TS internals: runtime crypto fallback; Go has one sha256 path |
| policy-runtime.test.ts | returns stable fingerprints across repeated calls | two resolves give the same 64-hex fingerprint | COVERED | core/policy/fingerprint_test.go TestFingerprintIsStableAndHex (asserts Fingerprint(), not via Resolve) |
| policy-runtime.test.ts | filters preselected categories only when policy scope is strict | strict scope filters preselected to allowlist, permissive passes through | COVERED | core/policy/resolve_test.go TestResolvePreselectedCategories/strict filters to allowlist and /permissive passes through |
| policy-runtime.test.ts | creates the same policy fingerprint across all hash strategies | createPolicyFingerprint of the sample policy equals golden bea550f2... | PARTIAL | Go asserts the canonical string (TestStableStringify) and the sha256 of it (TestSHA256Hex/long policy-like json) separately; no test asserts Fingerprint(policy) equals the golden |
| policy-runtime.test.ts | ignores presentation-only fields in the material policy fingerprint | id, i18n, uiProfile, scrollLock changes do not alter material fingerprint | COVERED | core/policy/fingerprint_test.go TestMaterialFingerprintIgnoresPresentation |
| policy-runtime.test.ts | changes the material policy fingerprint when banner layout changes | layout change alters material fingerprint | COVERED | core/policy/fingerprint_test.go TestMaterialFingerprintTracksMaterialChanges/banner layout (reorder, not regroup) |
| policy-runtime.test.ts | changes the material policy fingerprint when banner direction changes | direction change alters material fingerprint | COVERED | core/policy/fingerprint_test.go TestMaterialFingerprintTracksMaterialChanges/banner direction |
| policy-runtime.test.ts | changes the material policy fingerprint when consent semantics change | adding a category alters material fingerprint | COVERED | core/policy/fingerprint_test.go TestMaterialFingerprintTracksMaterialChanges/consent categories |
| policy-runtime.test.ts | resolves fallback when countryCode is null | null country selects fallback, matchedBy fallback | COVERED | core/policy/resolve_test.go TestResolvePrecedence/fallback when country unknown |
| policy-runtime.test.ts | does NOT use fallback when countryCode is present but unmatched | known unmatched country selects default | COVERED | core/policy/resolve_test.go TestResolvePrecedence/default when country known but unmatched |
| policy-runtime.test.ts | does NOT use fallback when countryCode matches a country policy | country match beats fallback | COVERED | core/policy/resolve_test.go TestResolvePrecedence/country match beats fallback |
| policy-runtime.test.ts | resolves fallback when disableGeoLocation forces null geo (simulated) | europe preset acts as fallback for null geo | COVERED | core/policy/presets_test.go TestPresetResolution/unknown geo falls back to europe |
| policy-runtime.test.ts | falls through to default when no fallback is configured and location is null | null country with no fallback selects default | COVERED | core/policy/resolve_test.go TestResolvePrecedence/default when no fallback and country unknown |
| policy-runtime.test.ts | errors when primaryActions is not in allowedActions | validation error naming primaryActions | COVERED | core/policy/validate_test.go TestInspectErrors/primary action not allowed |
| policy-runtime.test.ts | errors when layout contains actions not in allowedActions | validation error naming layout and the action | COVERED | core/policy/validate_test.go TestInspectErrors/layout action not allowed |
| policy-runtime.test.ts | passes when primaryActions is in allowedActions | no primaryActions error when valid | COVERED | core/policy/validate_test.go TestInspectAccepts/primary action within allowed |
| policy-runtime.test.ts | errors when multiple fallback policies are defined | error 'Only one fallback policy' | COVERED | core/policy/validate_test.go TestInspectErrors/multiple fallbacks |
| policy-runtime.test.ts | accepts a policy with only match.fallback=true as valid | fallback-only matcher raises no 'no matcher' error | COVERED | core/policy/validate_test.go TestInspectAccepts/fallback only matcher is valid |
| policy-runtime.test.ts | warns when no fallback policy is configured | warning 'No fallback policy configured' | COVERED | core/policy/validate_test.go TestInspectWarnings/no fallback configured |
| policy-runtime.test.ts | does not warn about fallback when a fallback is configured | no fallback warning when fallback present | COVERED | core/policy/validate_test.go TestInspectNoFallbackWarningWhenPresent |
| policy-runtime.test.ts | errors on empty-string policy ID | error 'missing a non-empty id' | COVERED | core/policy/validate_test.go TestInspectErrors/empty id |
| policy-runtime.test.ts | errors on whitespace-only policy ID | error 'missing a non-empty id' | COVERED | core/policy/validate_test.go TestInspectErrors/whitespace id |
| policy-runtime.test.ts | errors on duplicate policy IDs | error 'Duplicate id' | COVERED | core/policy/validate_test.go TestInspectErrors/duplicate ids |
| policy-runtime.test.ts | errors on policy with no matcher and not default/fallback | error 'no matcher' | COVERED | core/policy/validate_test.go TestInspectErrors/no matcher |
| policy-runtime.test.ts | returns undefined when no policy matches and no default exists | no decision | COVERED | core/policy/resolve_test.go TestResolveReturnsNil/no match and no default |
| policy-runtime.test.ts | returns undefined for undefined policies input | no decision for missing pack | COVERED | core/policy/resolve_test.go TestResolveReturnsNil/nil pack |
| policy-runtime.test.ts | returns undefined for empty policies array | no decision for empty pack | COVERED | core/policy/resolve_test.go TestResolveReturnsNil/empty pack |
| policy-runtime.test.ts | matches country codes case-insensitively | lowercase config country matches uppercase request | COVERED | core/policy/resolve_test.go TestResolveNormalisesCodes/country lowercase config and /country lowercase request |
| policy-runtime.test.ts | matches region codes case-insensitively | lowercase config region matches uppercase request, matchedBy region | PARTIAL | core/policy/resolve_test.go TestResolveNormalisesCodes/region lowercase covers lowercase request only; lowercase region in config not tested at Resolve |
| policy-runtime.test.ts | first match wins when multiple policies match the same country | array order decides | COVERED | core/policy/resolve_test.go TestResolveFirstMatchWins |
| policy-runtime.test.ts | warns on overlapping country matchers | warning naming DE and 'multiple' | COVERED | core/policy/validate_test.go TestInspectWarnings/overlapping country matchers |
| policy-runtime.test.ts | warns on overlapping region matchers | warning naming US-CA and 'multiple' | COVERED | core/policy/validate_test.go TestInspectWarnings/overlapping region matchers |
| policy-runtime.test.ts | warns when default policy also has explicit matchers | warning 'also defines explicit matchers' | COVERED | core/policy/validate_test.go TestInspectWarnings/default with explicit matchers |
| policy-runtime.test.ts | errors on IAB model without iab.enabled | error naming iab.enabled | COVERED | core/policy/validate_test.go TestInspectErrors/iab without iab enabled |
| policy-runtime.test.ts | errors on IAB policy with UI overrides | error on iab with ui overrides | COVERED | core/policy/validate_test.go TestInspectErrors/iab with ui overrides |
| policy-runtime.test.ts | errors on IAB policy with preselectedCategories | error on iab with preselectedCategories | COVERED | core/policy/validate_test.go TestInspectErrors/iab with preselected categories |
| policy-runtime.test.ts | inspectPolicies returns parse errors for completely invalid input | non-array input yields parse errors | N/A | Zod parse of untyped input; Go Config is a typed struct, no runtime parse |
| policy-runtime.test.ts | inspectPolicies returns parse errors for invalid policy objects | malformed policy object yields parse errors | N/A | Zod parse of untyped input; Go Config is a typed struct, no runtime parse |
| policy-runtime.test.ts | resolvePolicyDecision returns undefined for invalid policy input | garbage policies yield no decision | N/A | Zod parse of untyped input; not reachable in Go |
| policy-runtime.test.ts | resolvePolicyDecision returns undefined for semantically invalid policies | duplicate-id pack yields no decision | PARTIAL | core/policy/resolve_test.go TestResolveRejectsInvalidPack: Go returns nil decision plus an error (TS returns undefined) and the test uses two defaults, not duplicate ids |
| policy-runtime.test.ts | resolvePolicyDecision does not require jurisdiction | resolves without a jurisdiction argument | COVERED | core/policy/resolve_test.go TestResolveFirstMatchWins (policy.Request has no jurisdiction field) |
| policy-runtime.test.ts | IAB model forces categories to wildcard | iab categories resolve to ['*'] | COVERED | core/policy/resolve_test.go TestResolveIABModel |
| policy-runtime.test.ts | IAB model strips UI config from resolved policy | iab resolved policy has no ui | COVERED | core/policy/resolve_test.go TestResolveIABModel |
| policy-runtime.test.ts | policyMatchers.merge combines countries and regions | merge keeps countries and regions | COVERED | core/policy/validate_test.go TestMatchersMerge |
| policy-runtime.test.ts | policyMatchers.merge propagates fallback flag | merge keeps fallback | COVERED | core/policy/validate_test.go TestMatchersMerge |
| policy-runtime.test.ts | policyMatchers.merge propagates isDefault flag | merge keeps isDefault | COVERED | core/policy/validate_test.go TestMatchersMerge |
| policy-runtime.test.ts | policyMatchers.merge deduplicates countries | merge dedupes countries | COVERED | core/policy/validate_test.go TestMatchersMerge |
| policy-runtime.test.ts | policyMatchers.merge deduplicates regions | merge dedupes regions | COVERED | core/policy/validate_test.go TestMatchersMerge |
| policy-runtime.test.ts | region match takes priority over country match on the same request | region beats country | COVERED | core/policy/resolve_test.go TestResolveRegionBeatsCountry |
| policy-runtime.test.ts | errors on multiple default policies | error 'Only one default' | COVERED | core/policy/validate_test.go TestInspectErrors/multiple defaults |
| policy-runtime.test.ts | errors when dialog primaryActions is not in allowedActions | error naming dialog and primaryActions | COVERED | core/policy/validate_test.go TestInspectErrors/dialog primary action not allowed |
| policy-runtime.test.ts | produces identical fingerprints regardless of country code casing in match | de vs DE in config gives same fingerprint | COVERED | core/policy/fingerprint_test.go TestFingerprintIgnoresMatcherCasing |
| policy-runtime.test.ts | gpc defaults to undefined when not specified | unset gpc stays unset | COVERED | core/policy/resolve_test.go TestResolveGPC/unset stays nil |
| policy-runtime.test.ts | gpc=false is preserved in resolved policy | gpc false kept | COVERED | core/policy/resolve_test.go TestResolveGPC/false is preserved |

## backend/src/policies/builder.test.ts

| TS file | test name | behaviour asserted (one line) | Go status | Go test or source |
|---|---|---|---|---|
| builder.test.ts | builds a policy from country model and categories | buildPolicyConfig dedupes countries, categories, allowedActions and uppercases countries | MISSING IN GO | No policy builder in Go (Config is a typed struct); core/policy has Match* constructors and ComposePacks only; dedupe lives in resolver and is untested |
| builder.test.ts | supports region and country with default matcher | buildPolicyConfig merges regions, countries and isDefault into match | MISSING IN GO | No policy builder in Go (Config is a typed struct); core/policy has Match* constructors and ComposePacks only; MatchMerge is tested in TestMatchersMerge |
| builder.test.ts | keeps preselected categories separate from scoped categories | preselected list not folded into categories | MISSING IN GO | No policy builder in Go (Config is a typed struct); core/policy has Match* constructors and ComposePacks only |
| builder.test.ts | omits empty categories and preselected categories | empty lists yield no consent block | MISSING IN GO | No policy builder in Go (Config is a typed struct); core/policy has Match* constructors and ComposePacks only |
| builder.test.ts | creates a pack from input entries | buildPolicyPack maps entries to policies | MISSING IN GO | No policy builder in Go (Config is a typed struct); core/policy has Match* constructors and ComposePacks only |
| builder.test.ts | appends a default fallback policy when none is provided | buildPolicyPackWithDefault appends none/none default | MISSING IN GO | No policy builder in Go (Config is a typed struct); core/policy has Match* constructors and ComposePacks only; PresetWorldNoBanner is the nearest equivalent |
| builder.test.ts | uses a custom default fallback policy input when provided | custom default input replaces generated default, matchers dropped | MISSING IN GO | No policy builder in Go (Config is a typed struct); core/policy has Match* constructors and ComposePacks only |
| builder.test.ts | exposes composePacks on object helpers | policyBuilder.composePacks is composePacks | N/A | TS object-helper surface |
| builder.test.ts | exposes object helpers | policyBuilder.create, createPack, createPackWithDefault work | N/A | TS object-helper surface over the missing builder |
| builder.test.ts | merges multiple packs preserving order | composePacks returns eu, ca, default in order | PARTIAL | core/policy/presets_test.go TestComposePacksKeepsFirstDuplicate uses 3 packs but asserts only length 2 and first entry; full order not asserted |
| builder.test.ts | deduplicates by id keeping first occurrence | first duplicate id kept | COVERED | core/policy/presets_test.go TestComposePacksKeepsFirstDuplicate |

## backend/src/policies/defaults.test.ts

| TS file | test name | behaviour asserted (one line) | Go status | Go test or source |
|---|---|---|---|---|
| defaults.test.ts | returns europe opt-in and iab templates | europe opt-in/iab: model, split-row layout, customize primary, row direction on banner and dialog, 31-country IAB list | PARTIAL | core/policy/presets_test.go TestPresetResolution (europe id, opt-in model) and TestPresetEuropeIABDropsUI (wildcard, no UI); layout, primaryActions, direction and the country list are not asserted |
| defaults.test.ts | returns california opt-in and opt-out templates | california opt-in/opt-out models, US-CA region, compact profile, split-row layout, opt-out ui mode none | PARTIAL | core/policy/presets_test.go TestPresetResolution/california gets opt-out by region and TestPresetCaliforniaEnablesGPC; PresetCalifornia(ModelOptIn), uiProfile, layout and opt-out ui mode none not asserted |
| defaults.test.ts | returns quebec opt-in template | quebec opt-in: CA-QC region, compact profile, split-row layout | PARTIAL | core/policy/presets_test.go TestPresetPackIsValid/with quebec (validity only); api/api_test.go TestInitResolvesPolicy/quebec asserts id, model, matchedBy; profile and layout not asserted |
| defaults.test.ts | returns world no-banner default template | model none, ui mode none, isDefault | PARTIAL | core/policy/presets_test.go TestPresetResolution (model none, matchedBy default); ui mode none not asserted |
| defaults.test.ts | supports composing starter packs from the remaining presets | pack ids europe_opt_in, california_opt_out, world_no_banner | COVERED | core/policy/presets_test.go TestPresetResolution (asserts each of the three ids) |

## backend/src/policies/matchers.test.ts

| TS file | test name | behaviour asserted (one line) | Go status | Go test or source |
|---|---|---|---|---|
| matchers.test.ts | returns normalized countries | countries uppercased and deduped | PARTIAL | core/policy/validate_test.go TestMatchersMerge exercises MatchCountries through MatchMerge only |
| matchers.test.ts | returns EU and EEA groups | eu, eea, uk matchers return the fixed country lists | NOT COVERED | MatchEU, MatchEEA, MatchUK in core/policy/match.go; no test asserts the lists |
| matchers.test.ts | returns IAB helper | iab matcher is EEA plus UK | NOT COVERED | MatchIAB in core/policy/match.go; no test asserts the list (europe preset resolves for DE and GB only) |
| matchers.test.ts | merges match fragments | merge keeps countries and regions normalized | COVERED | core/policy/validate_test.go TestMatchersMerge |

## backend/src/handlers/init/policy.test.ts

| TS file | test name | behaviour asserted (one line) | Go status | Go test or source |
|---|---|---|---|---|
| policy.test.ts | matches with precedence region > country > default | region wins over country and default; lowercase US and US-CA input; fingerprint length 64 | COVERED | core/policy/resolve_test.go TestResolveRegionBeatsCountry, TestResolveNormalisesCodes/region with country prefix, TestResolvePrecedence; core/policy/fingerprint_test.go TestFingerprintIsStableAndHex (no single three-policy test) |
| policy.test.ts | returns default policy when no specific match exists | default selected, scopeMode permissive | COVERED | core/policy/resolve_test.go TestResolveDefaults and TestResolvePrecedence/default when country known but unmatched |
| policy.test.ts | preserves first-match order for overlapping matcher keys | first country policy wins | COVERED | core/policy/resolve_test.go TestResolveFirstMatchWins |
| policy.test.ts | resolves iab model when a matching policy defines it | iab policy: model iab, categories ['*'], matchedBy country | PARTIAL | core/policy/resolve_test.go TestResolveIABModel asserts wildcard categories and no UI; model value and matchedBy not asserted |
| policy.test.ts | normalizes iab categories to wildcard even when specific IDs are configured | iab with categories [measurement] gives ['*'] | COVERED | core/policy/resolve_test.go TestResolveIABModel |
| policy.test.ts | preserves strict scope mode when configured | resolved scopeMode is strict | NOT COVERED | mapPolicy copies scopeMode (core/policy/resolve.go); no test asserts resolved ScopeMode strict (TestResolveDefaults asserts permissive only) |
| policy.test.ts | filters preselected categories to the configured policy scope in strict mode | strict filters preselected to categories | COVERED | core/policy/resolve_test.go TestResolvePreselectedCategories/strict filters to allowlist |
| policy.test.ts | keeps preselected categories outside policy categories in permissive mode | permissive keeps marketing | COVERED | core/policy/resolve_test.go TestResolvePreselectedCategories/permissive passes through |
| policy.test.ts | normalizes UI action order and primary actions against allowed actions | allowedActions deduped, layout, primary, direction, profile, scrollLock kept | NOT COVERED | normalizeSurface in core/policy/resolve.go; no Go test asserts resolved UI |
| policy.test.ts | keeps banner and dialog actions isolated without cross-surface fallback | banner and dialog resolve independently | NOT COVERED | normalizeSurface in core/policy/resolve.go; no Go test asserts resolved UI |
| policy.test.ts | does not infer dialog config from banner config | dialog stays nil when only banner configured | NOT COVERED | normalizeSurface in core/policy/resolve.go; no Go test asserts resolved UI |
| policy.test.ts | throws when multiple defaults are configured | validate rejects two defaults | COVERED | core/policy/validate_test.go TestInspectErrors/multiple defaults; core/policy/resolve_test.go TestResolveRejectsInvalidPack |
| policy.test.ts | throws when policy model is iab but top-level IAB is not enabled | validate rejects iab without iab.enabled | COVERED | core/policy/validate_test.go TestInspectErrors/iab without iab enabled |
| policy.test.ts | allows policy model iab when top-level IAB is enabled | no error with iab enabled | COVERED | core/policy/validate_test.go TestInspectAccepts/iab with iab enabled |
| policy.test.ts | throws when iab policy defines ui overrides | validate rejects iab with ui | COVERED | core/policy/validate_test.go TestInspectErrors/iab with ui overrides |
| policy.test.ts | throws when primaryActions are not in allowedActions | validate rejects primary not in allowed | COVERED | core/policy/validate_test.go TestInspectErrors/primary action not allowed |
| policy.test.ts | throws when layout contains actions not in allowedActions | validate rejects layout action not allowed | COVERED | core/policy/validate_test.go TestInspectErrors/layout action not allowed |
| policy.test.ts | throws when policy IDs are duplicated | validate rejects duplicate ids | COVERED | core/policy/validate_test.go TestInspectErrors/duplicate ids |
| policy.test.ts | throws when policy has no matcher and is not default | validate rejects matcherless policy | COVERED | core/policy/validate_test.go TestInspectErrors/no matcher |
| policy.test.ts | warns when no default policy is configured | warning 'No default policy configured', no errors | COVERED | core/policy/validate_test.go TestInspectWarnings/no default configured |
| policy.test.ts | warns about overlapping matchers and mixed default matchers | country, region overlap and default-with-matchers warnings | COVERED | core/policy/validate_test.go TestInspectWarnings/overlapping country matchers, /overlapping region matchers, /default with explicit matchers |

## backend/src/handlers/init/geo.test.ts

| TS file | test name | behaviour asserted (one line) | Go status | Go test or source |
|---|---|---|---|---|
| geo.test.ts | should identify AT as GDPR jurisdiction | AT gives GDPR | NOT COVERED | AT is in euCountries (core/jurisdiction/jurisdiction.go); no Go test asserts it |
| geo.test.ts | should identify BE as GDPR jurisdiction | BE gives GDPR | NOT COVERED | BE is in euCountries (core/jurisdiction/jurisdiction.go); no Go test asserts it |
| geo.test.ts | should identify BG as GDPR jurisdiction | BG gives GDPR | NOT COVERED | BG is in euCountries (core/jurisdiction/jurisdiction.go); no Go test asserts it |
| geo.test.ts | should identify HR as GDPR jurisdiction | HR gives GDPR | NOT COVERED | HR is in euCountries (core/jurisdiction/jurisdiction.go); no Go test asserts it |
| geo.test.ts | should identify CY as GDPR jurisdiction | CY gives GDPR | NOT COVERED | CY is in euCountries (core/jurisdiction/jurisdiction.go); no Go test asserts it |
| geo.test.ts | should identify CZ as GDPR jurisdiction | CZ gives GDPR | NOT COVERED | CZ is in euCountries (core/jurisdiction/jurisdiction.go); no Go test asserts it |
| geo.test.ts | should identify DK as GDPR jurisdiction | DK gives GDPR | NOT COVERED | DK is in euCountries (core/jurisdiction/jurisdiction.go); no Go test asserts it |
| geo.test.ts | should identify EE as GDPR jurisdiction | EE gives GDPR | NOT COVERED | EE is in euCountries (core/jurisdiction/jurisdiction.go); no Go test asserts it |
| geo.test.ts | should identify FI as GDPR jurisdiction | FI gives GDPR | NOT COVERED | FI is in euCountries (core/jurisdiction/jurisdiction.go); no Go test asserts it |
| geo.test.ts | should identify FR as GDPR jurisdiction | FR gives GDPR | COVERED | core/jurisdiction/jurisdiction_test.go TestCheck/france is gdpr |
| geo.test.ts | should identify DE as GDPR jurisdiction | DE gives GDPR | COVERED | core/jurisdiction/jurisdiction_test.go TestCheck/germany is gdpr |
| geo.test.ts | should identify GR as GDPR jurisdiction | GR gives GDPR | NOT COVERED | GR is in euCountries (core/jurisdiction/jurisdiction.go); no Go test asserts it |
| geo.test.ts | should identify HU as GDPR jurisdiction | HU gives GDPR | NOT COVERED | HU is in euCountries (core/jurisdiction/jurisdiction.go); no Go test asserts it |
| geo.test.ts | should identify IE as GDPR jurisdiction | IE gives GDPR | NOT COVERED | IE is in euCountries (core/jurisdiction/jurisdiction.go); no Go test asserts it |
| geo.test.ts | should identify IT as GDPR jurisdiction | IT gives GDPR | NOT COVERED | IT is in euCountries (core/jurisdiction/jurisdiction.go); no Go test asserts it |
| geo.test.ts | should identify LV as GDPR jurisdiction | LV gives GDPR | NOT COVERED | LV is in euCountries (core/jurisdiction/jurisdiction.go); no Go test asserts it |
| geo.test.ts | should identify LT as GDPR jurisdiction | LT gives GDPR | NOT COVERED | LT is in euCountries (core/jurisdiction/jurisdiction.go); no Go test asserts it |
| geo.test.ts | should identify LU as GDPR jurisdiction | LU gives GDPR | NOT COVERED | LU is in euCountries (core/jurisdiction/jurisdiction.go); no Go test asserts it |
| geo.test.ts | should identify MT as GDPR jurisdiction | MT gives GDPR | NOT COVERED | MT is in euCountries (core/jurisdiction/jurisdiction.go); no Go test asserts it |
| geo.test.ts | should identify NL as GDPR jurisdiction | NL gives GDPR | NOT COVERED | NL is in euCountries (core/jurisdiction/jurisdiction.go); no Go test asserts it |
| geo.test.ts | should identify PL as GDPR jurisdiction | PL gives GDPR | NOT COVERED | PL is in euCountries (core/jurisdiction/jurisdiction.go); no Go test asserts it |
| geo.test.ts | should identify PT as GDPR jurisdiction | PT gives GDPR | NOT COVERED | PT is in euCountries (core/jurisdiction/jurisdiction.go); no Go test asserts it |
| geo.test.ts | should identify RO as GDPR jurisdiction | RO gives GDPR | NOT COVERED | RO is in euCountries (core/jurisdiction/jurisdiction.go); no Go test asserts it |
| geo.test.ts | should identify SK as GDPR jurisdiction | SK gives GDPR | NOT COVERED | SK is in euCountries (core/jurisdiction/jurisdiction.go); no Go test asserts it |
| geo.test.ts | should identify SI as GDPR jurisdiction | SI gives GDPR | NOT COVERED | SI is in euCountries (core/jurisdiction/jurisdiction.go); no Go test asserts it |
| geo.test.ts | should identify ES as GDPR jurisdiction | ES gives GDPR | NOT COVERED | ES is in euCountries (core/jurisdiction/jurisdiction.go); no Go test asserts it |
| geo.test.ts | should identify SE as GDPR jurisdiction | SE gives GDPR | NOT COVERED | SE is in euCountries (core/jurisdiction/jurisdiction.go); no Go test asserts it |
| geo.test.ts | should identify IS as GDPR jurisdiction | IS gives GDPR | COVERED | core/jurisdiction/jurisdiction_test.go TestCheck/iceland is gdpr via eea |
| geo.test.ts | should identify NO as GDPR jurisdiction | NO gives GDPR | COVERED | core/jurisdiction/jurisdiction_test.go TestCheck/norway is gdpr via eea |
| geo.test.ts | should identify LI as GDPR jurisdiction | LI gives GDPR | COVERED | core/jurisdiction/jurisdiction_test.go TestCheck/liechtenstein is gdpr via eea |
| geo.test.ts | should identify GB as GDPR jurisdiction | GB gives UK_GDPR | COVERED | core/jurisdiction/jurisdiction_test.go TestCheck/uk is uk gdpr |
| geo.test.ts | should identify CH as CH jurisdiction | CH gives CH | COVERED | core/jurisdiction/jurisdiction_test.go TestCheck/switzerland |
| geo.test.ts | should identify BR as BR jurisdiction | BR gives BR | COVERED | core/jurisdiction/jurisdiction_test.go TestCheck/brazil |
| geo.test.ts | should identify CA as PIPEDA jurisdiction | CA gives PIPEDA | COVERED | core/jurisdiction/jurisdiction_test.go TestCheck/canada without region is pipeda |
| geo.test.ts | should identify AU as AU jurisdiction | AU gives AU | COVERED | core/jurisdiction/jurisdiction_test.go TestCheck/australia |
| geo.test.ts | should identify JP as APPI jurisdiction | JP gives APPI | COVERED | core/jurisdiction/jurisdiction_test.go TestCheck/japan is appi |
| geo.test.ts | should identify KR as PIPA jurisdiction | KR gives PIPA | COVERED | core/jurisdiction/jurisdiction_test.go TestCheck/korea is pipa |
| geo.test.ts | should identify US as non-regulated (NONE jurisdiction) | US gives NONE | COVERED | core/jurisdiction/jurisdiction_test.go TestCheck/us without region is none |
| geo.test.ts | should identify RU as non-regulated (NONE jurisdiction) | RU gives NONE | PARTIAL | core/jurisdiction/jurisdiction_test.go TestCheck/unknown country is none asserts ZZ only; RU not asserted |
| geo.test.ts | should identify CN as non-regulated (NONE jurisdiction) | CN gives NONE | PARTIAL | core/jurisdiction/jurisdiction_test.go TestCheck/unknown country is none asserts ZZ only; CN not asserted |
| geo.test.ts | should identify IN as non-regulated (NONE jurisdiction) | IN gives NONE | PARTIAL | core/jurisdiction/jurisdiction_test.go TestCheck/unknown country is none asserts ZZ only; IN not asserted |
| geo.test.ts | should identify MX as non-regulated (NONE jurisdiction) | MX gives NONE | PARTIAL | core/jurisdiction/jurisdiction_test.go TestCheck/unknown country is none asserts ZZ only; MX not asserted |
| geo.test.ts | should identify AR as non-regulated (NONE jurisdiction) | AR gives NONE | PARTIAL | core/jurisdiction/jurisdiction_test.go TestCheck/unknown country is none asserts ZZ only; AR not asserted |
| geo.test.ts | should identify EG as non-regulated (NONE jurisdiction) | EG gives NONE | PARTIAL | core/jurisdiction/jurisdiction_test.go TestCheck/unknown country is none asserts ZZ only; EG not asserted |
| geo.test.ts | should identify ZA as non-regulated (NONE jurisdiction) | ZA gives NONE | PARTIAL | core/jurisdiction/jurisdiction_test.go TestCheck/unknown country is none asserts ZZ only; ZA not asserted |
| geo.test.ts | should identify TH as non-regulated (NONE jurisdiction) | TH gives NONE | PARTIAL | core/jurisdiction/jurisdiction_test.go TestCheck/unknown country is none asserts ZZ only; TH not asserted |
| geo.test.ts | should identify PH as non-regulated (NONE jurisdiction) | PH gives NONE | PARTIAL | core/jurisdiction/jurisdiction_test.go TestCheck/unknown country is none asserts ZZ only; PH not asserted |
| geo.test.ts | should handle null country code by defaulting to NONE | null country gives NONE | COVERED | core/jurisdiction/jurisdiction_test.go TestCheck/empty country is none (Go takes a string, no null) |
| geo.test.ts | should handle empty string country code by defaulting to NONE | empty country gives NONE | COVERED | core/jurisdiction/jurisdiction_test.go TestCheck/empty country is none |
| geo.test.ts | should handle lowercase country codes correctly | lowercase de gives GDPR | PARTIAL | core/jurisdiction/jurisdiction_test.go TestCheck/california lowercase asserts lowercase for us/ca only; lowercase de not asserted |
| geo.test.ts | should handle mixed case country codes across different jurisdictions | de/De/DE, ch/Ch/CH, ca/Ca/CA map identically | PARTIAL | core/jurisdiction/jurisdiction_test.go TestCheck/california lowercase only; mixed-case De, Ch, Ca not asserted |
| geo.test.ts | should handle invalid country codes | XX, ZZ, 123, ABC give NONE | PARTIAL | core/jurisdiction/jurisdiction_test.go TestCheck/unknown country is none asserts ZZ only |
| geo.test.ts | should always return an object with required properties | DE gives GDPR | COVERED | core/jurisdiction/jurisdiction_test.go TestCheck/germany is gdpr |
| geo.test.ts | should return consistent types regardless of input | result is a string for any input | N/A | TS typeof check; Go returns the Code type |
| geo.test.ts | should correctly map all supported jurisdictions | one representative per jurisdiction group | COVERED | core/jurisdiction/jurisdiction_test.go TestCheck (DE, NO, GB, CH, BR, CA, AU, JP, KR, US, empty) |
| geo.test.ts | should identify CA-QC as QC_LAW25 jurisdiction (case-insensitive) | QC, qc, Qc with CA give QC_LAW25 | PARTIAL | core/jurisdiction/jurisdiction_test.go TestCheck/quebec is law25 asserts QC only; lowercase and mixed case not asserted |
| geo.test.ts | should handle dash-separated region codes for Quebec | CA-QC, ca-qc, Ca-Qc give QC_LAW25 | PARTIAL | core/jurisdiction/jurisdiction_test.go TestCheck/quebec prefixed region asserts CA-QC only; lowercase variants not asserted |
| geo.test.ts | should return PIPEDA for non-Quebec Canadian provinces | ON, BC, AB, null give PIPEDA | COVERED | core/jurisdiction/jurisdiction_test.go TestCheck/canada outside quebec is pipeda (ON) and /canada without region is pipeda; BC and AB not asserted |
| geo.test.ts | should return PIPEDA for dash-separated non-Quebec Canadian provinces | CA-ON, CA-BC, CA-AB give PIPEDA | NOT COVERED | Prefixed non-Quebec region handled by normalizeRegion; no Go test asserts it |
| geo.test.ts | should identify US-CA as CCPA jurisdiction (case-insensitive) | CA, ca, Ca with US give CCPA | COVERED | core/jurisdiction/jurisdiction_test.go TestCheck/california is ccpa and /california lowercase |
| geo.test.ts | should handle dash-separated region codes for California | US-CA, us-ca, Us-Ca give CCPA | COVERED | core/jurisdiction/jurisdiction_test.go TestCheck/california prefixed region (US-CA); lowercase prefixed not asserted |
| geo.test.ts | should not apply CCPA for non-CCPA US regions | NY, TX, WA, FL, null give NONE | COVERED | core/jurisdiction/jurisdiction_test.go TestCheck/other us state is none (NY) and /us without region is none |
| geo.test.ts | should not apply CCPA for dash-separated non-CCPA US regions | US-NY, US-TX, US-WA give NONE | NOT COVERED | Prefixed non-CCPA region handled by normalizeRegion; no Go test asserts it |

## backend/src/handlers/init/resolve-init.test.ts

| TS file | test name | behaviour asserted (one line) | Go status | Go test or source |
|---|---|---|---|---|
| resolve-init.test.ts | returns jurisdiction, location, translations, and branding | init payload carries jurisdiction DE=GDPR, location DE/null, translations, branding c15t | PARTIAL | api/api_test.go TestInitResolvesPolicy/germany asserts jurisdiction; location for a known geo not asserted; Go init has no translations or branding |
| resolve-init.test.ts | omits IAB payload when active policy is not iab | non-iab policy: no gvl, cmpId, customVendors; policy model opt-in | N/A | IAB/TCF out of scope (GVL, cmpId, customVendors) |
| resolve-init.test.ts | includes IAB payload when active policy is iab | iab policy: gvl, cmpId, customVendors, GVL fetched for en | N/A | IAB/TCF out of scope (GVL, cmpId, customVendors) |
| resolve-init.test.ts | treats explicit empty policy pack as no-banner mode | empty pack yields synthesized policy model none, ui none | MISSING IN GO | Go init returns no policy and no decision when nothing resolves (api/routes.go init); no synthesized none policy, and no API test for the empty-pack case |
| resolve-init.test.ts | returns the same fingerprint as the shared resolver | init policyDecision id, fingerprint, matchedBy equal resolver output, jurisdiction GDPR | PARTIAL | api/api_test.go TestInitResolvesPolicy asserts policy id, matchedBy, jurisdiction and fingerprint length 64; equality with policy.Resolve not asserted |
| resolve-init.test.ts | includes policy i18n and preselected categories in signed snapshots | snapshot payload carries policyI18n and preselectedCategories | NOT COVERED | api/snapshot.go signs both; api/api_test.go TestSnapshotPayloadCarriesPolicyDetail field list omits policyI18n and preselectedCategories |
| resolve-init.test.ts | defaults to GDPR jurisdiction when geo-location is disabled | geo disabled gives GDPR and empty location | COVERED | api/api_test.go TestInitGeoDisabledFallsBackToGDPR |

## backend/src/handlers/init/index.test.ts

| TS file | test name | behaviour asserted (one line) | Go status | Go test or source |
|---|---|---|---|---|
| index.test.ts | getHeaders: extracts country code from cf-ipcountry header | cf-ipcountry read as country | COVERED | core/jurisdiction/location_test.go TestLocationFromHeaders/cloudflare |
| index.test.ts | getHeaders: falls back to alternative country code headers | x-vercel-ip-country read as country | COVERED | core/jurisdiction/location_test.go TestLocationFromHeaders/vercel |
| index.test.ts | getHeaders: prioritizes cf-ipcountry over other headers | cf-ipcountry beats x-vercel-ip-country | PARTIAL | core/jurisdiction/location_test.go TestLocationFromHeaders/c15t header wins over cloudflare tests x-c15t-country over cf only; cf over vercel not asserted |
| index.test.ts | getHeaders: extracts country code from x-country header | x-country read as country | COVERED | core/jurisdiction/location_test.go TestLocationFromHeaders/generic country header |
| index.test.ts | getHeaders: prioritizes cf-ipcountry over x-country | cf-ipcountry beats x-country | PARTIAL | core/jurisdiction/location_test.go TestLocationFromHeaders/c15t header wins over cloudflare tests x-c15t-country over cf only; cf over x-country not asserted |
| index.test.ts | getHeaders: extracts region code from headers | country US with x-vercel-ip-country-region CA | COVERED | core/jurisdiction/location_test.go TestLocationFromHeaders/vercel region |
| index.test.ts | getHeaders: handles missing headers gracefully | no headers give empty country and region | COVERED | core/jurisdiction/location_test.go TestLocationFromHeaders/no geo headers |
| index.test.ts | getHeaders: handles undefined headers | undefined headers give null country, region, acceptLanguage | N/A | TS null-handling of an optional Headers argument |
| index.test.ts | checkJurisdiction: returns GDPR for EU countries | DE, FR, IT give GDPR | PARTIAL | core/jurisdiction/jurisdiction_test.go TestCheck/germany is gdpr, /france is gdpr; IT not asserted |
| index.test.ts | checkJurisdiction: returns UK_GDPR for UK | GB gives UK_GDPR | COVERED | core/jurisdiction/jurisdiction_test.go TestCheck/uk is uk gdpr |
| index.test.ts | checkJurisdiction: returns CCPA for California | US/CA gives CCPA | COVERED | core/jurisdiction/jurisdiction_test.go TestCheck/california is ccpa |
| index.test.ts | checkJurisdiction: returns NONE for non-regulated regions | US with no region and TX give NONE | COVERED | core/jurisdiction/jurisdiction_test.go TestCheck/us without region is none and /other us state is none (NY) |
| index.test.ts | checkJurisdiction: returns PIPEDA for Canada | CA gives PIPEDA | COVERED | core/jurisdiction/jurisdiction_test.go TestCheck/canada without region is pipeda |
| index.test.ts | checkJurisdiction: returns CH for Switzerland | CH gives CH | COVERED | core/jurisdiction/jurisdiction_test.go TestCheck/switzerland and TestCheckSwitzerlandNotTreatedAsEEA |
| index.test.ts | checkJurisdiction: handles null country code | null country gives NONE | COVERED | core/jurisdiction/jurisdiction_test.go TestCheck/empty country is none |
| index.test.ts | parseAcceptLanguage: returns en for null input | null gives en | MISSING IN GO | No translation or Accept-Language parsing in Go (Accept-Language is only stored as the consent language); Go init returns no translations |
| index.test.ts | parseAcceptLanguage: parses simple language code | de gives de | MISSING IN GO | No translation or Accept-Language parsing in Go (Accept-Language is only stored as the consent language); Go init returns no translations |
| index.test.ts | parseAcceptLanguage: parses language with region | de-DE gives de | MISSING IN GO | No translation or Accept-Language parsing in Go (Accept-Language is only stored as the consent language); Go init returns no translations |
| index.test.ts | parseAcceptLanguage: parses Accept-Language with quality factors | de-DE,de;q=0.9,en;q=0.8 gives de | MISSING IN GO | No translation or Accept-Language parsing in Go (Accept-Language is only stored as the consent language); Go init returns no translations |
| index.test.ts | getTranslationsData: returns en translations for null Accept-Language | null gives en base translations | MISSING IN GO | No translation or Accept-Language parsing in Go (Accept-Language is only stored as the consent language); Go init returns no translations |
| index.test.ts | getTranslationsData: returns de translations for de-DE | de-DE gives de base translations | MISSING IN GO | No translation or Accept-Language parsing in Go (Accept-Language is only stored as the consent language); Go init returns no translations |
| index.test.ts | getTranslationsData: merges custom translations | custom en title overrides base | MISSING IN GO | No translation or Accept-Language parsing in Go (Accept-Language is only stored as the consent language); Go init returns no translations |
| index.test.ts | buildResponse: returns properly structured response | response has jurisdiction, location, translations, branding | PARTIAL | api/api_test.go TestInitResolvesPolicy asserts jurisdiction and TestInitGeoDisabledFallsBackToGDPR asserts location; Go has no translations or branding |
| index.test.ts | getLocation: returns null location when geo is disabled | geo disabled ignores cf-ipcountry DE, location empty | COVERED | api/api_test.go TestInitGeoDisabledFallsBackToGDPR |
| index.test.ts | getJurisdiction: returns GDPR when geo is disabled | geo disabled gives GDPR | COVERED | core/jurisdiction/jurisdiction_test.go TestResolveWhenGeoDisabled; api/api_test.go TestInitGeoDisabledFallsBackToGDPR |
| index.test.ts | getJurisdiction: returns appropriate jurisdiction based on location | DE GDPR, US/CA CCPA, GB UK_GDPR | COVERED | core/jurisdiction/jurisdiction_test.go TestResolveUsesLocation (US/CA) and TestCheck (DE, GB) |

## backend/src/handlers/init/translations.test.ts

| TS file | test name | behaviour asserted (one line) | Go status | Go test or source |
|---|---|---|---|---|
| translations.test.ts | should return 'en' translations when Accept-Language is null | null gives en | MISSING IN GO | No translation or Accept-Language parsing in Go (Accept-Language is only stored as the consent language); Go init returns no translations; policy i18n is passed through as data only (core/policy/policy.go I18n) |
| translations.test.ts | should return 'en' translations for unsupported language | xx-XX,en falls to en | MISSING IN GO | No translation or Accept-Language parsing in Go (Accept-Language is only stored as the consent language); Go init returns no translations; policy i18n is passed through as data only (core/policy/policy.go I18n) |
| translations.test.ts | should return 'de' translations for 'de-DE' | de-DE gives de | MISSING IN GO | No translation or Accept-Language parsing in Go (Accept-Language is only stored as the consent language); Go init returns no translations; policy i18n is passed through as data only (core/policy/policy.go I18n) |
| translations.test.ts | should merge custom translations for the preferred language | custom en title merged over base | MISSING IN GO | No translation or Accept-Language parsing in Go (Accept-Language is only stored as the consent language); Go init returns no translations; policy i18n is passed through as data only (core/policy/policy.go I18n) |
| translations.test.ts | should stay within configured custom languages when the browser language is unavailable | custom de only, browser en gives de | MISSING IN GO | No translation or Accept-Language parsing in Go (Accept-Language is only stored as the consent language); Go init returns no translations; policy i18n is passed through as data only (core/policy/policy.go I18n) |
| translations.test.ts | should handle partially provided custom translations | partial custom keeps base title | MISSING IN GO | No translation or Accept-Language parsing in Go (Accept-Language is only stored as the consent language); Go init returns no translations; policy i18n is passed through as data only (core/policy/policy.go I18n) |
| translations.test.ts | should return base translations if custom translations are empty for the language | empty custom de gives base de | MISSING IN GO | No translation or Accept-Language parsing in Go (Accept-Language is only stored as the consent language); Go init returns no translations; policy i18n is passed through as data only (core/policy/policy.go I18n) |
| translations.test.ts | should return custom translations for unsupported base language | custom xx language used | MISSING IN GO | No translation or Accept-Language parsing in Go (Accept-Language is only stored as the consent language); Go init returns no translations; policy i18n is passed through as data only (core/policy/policy.go I18n) |
| translations.test.ts | should resolve profile+language before fallback chain | profile us_ca with language de gives CA DE title | MISSING IN GO | No translation or Accept-Language parsing in Go (Accept-Language is only stored as the consent language); Go init returns no translations; policy i18n is passed through as data only (core/policy/policy.go I18n) |
| translations.test.ts | should fallback from profile+language to profile+en | profile us_fl with fr falls to profile en | MISSING IN GO | No translation or Accept-Language parsing in Go (Accept-Language is only stored as the consent language); Go init returns no translations; policy i18n is passed through as data only (core/policy/policy.go I18n) |
| translations.test.ts | should keep policy language selection within configured profile languages | profile eu stays in en/fr for zh browser | MISSING IN GO | No translation or Accept-Language parsing in Go (Accept-Language is only stored as the consent language); Go init returns no translations; policy i18n is passed through as data only (core/policy/policy.go I18n) |
| translations.test.ts | should not expand a policy profile with default profile languages | profile eu does not borrow default es | MISSING IN GO | No translation or Accept-Language parsing in Go (Accept-Language is only stored as the consent language); Go init returns no translations; policy i18n is passed through as data only (core/policy/policy.go I18n) |
| translations.test.ts | should use a profile-local fallbackLanguage within the active profile | profile fallbackLanguage fr used | MISSING IN GO | No translation or Accept-Language parsing in Go (Accept-Language is only stored as the consent language); Go init returns no translations; policy i18n is passed through as data only (core/policy/policy.go I18n) |
| translations.test.ts | should fallback to default profile language when profile is missing | missing profile falls to default profile de | MISSING IN GO | No translation or Accept-Language parsing in Go (Accept-Language is only stored as the consent language); Go init returns no translations; policy i18n is passed through as data only (core/policy/policy.go I18n) |
| translations.test.ts | should list configured profiles | listProfiles returns default, us_ca | MISSING IN GO | No translation or Accept-Language parsing in Go (Accept-Language is only stored as the consent language); Go init returns no translations; policy i18n is passed through as data only (core/policy/policy.go I18n) |
| translations.test.ts | should validate policy i18n profile references | error for missing i18n profile reference | MISSING IN GO | No translation or Accept-Language parsing in Go (Accept-Language is only stored as the consent language); Go init returns no translations; policy i18n is passed through as data only (core/policy/policy.go I18n) |

## backend/src/routes/init.test.ts

| TS file | test name | behaviour asserted (one line) | Go status | Go test or source |
|---|---|---|---|---|
| init.test.ts | omits IAB payload when active policy is not iab | non-iab: no gvl, cmpId, customVendors, translations.iab; banner layout, direction, profile, scrollLock echoed | N/A | IAB/TCF out of scope (GVL, cmpId, customVendors); the banner field passthrough assertions have no Go init test (see policy.test.ts UI normalization rows) |
| init.test.ts | includes IAB payload when active policy is iab | iab: categories ['*'], gvl, cmpId, customVendors, translations.iab | N/A | IAB/TCF out of scope (GVL, cmpId, customVendors); wildcard categories covered in core/policy/resolve_test.go TestResolveIABModel |
| init.test.ts | preserves legacy IAB behavior when no policies are configured | no policies with iab enabled: gvl and cmpId present | N/A | IAB/TCF out of scope (GVL, cmpId, customVendors) |
| init.test.ts | treats an explicit empty policy pack as no-banner mode | empty pack gives policy model none, ui mode none, no IAB | MISSING IN GO | Go init returns no policy when nothing resolves; no synthesized none policy |
| init.test.ts | treats an explicit policy pack with no match as no-banner mode | unmatched pack gives policy model none, ui mode none | MISSING IN GO | Go init returns no policy and no decision when nothing matches; consent write returns 400 POLICY_RESOLUTION_FAILED (api/routes.go); neither is tested |
| init.test.ts | returns the same fingerprint as the shared resolver for hosted init responses | init policyDecision equals resolver output | PARTIAL | api/api_test.go TestInitResolvesPolicy asserts fingerprint length 64 only; equality with policy.Resolve not asserted |
| init.test.ts | includes policy i18n and preselected categories in signed snapshots | snapshot payload carries policyI18n and preselectedCategories | NOT COVERED | api/snapshot.go signs both; no test asserts them |

## backend/src/routes/policy-packs-e2e.test.ts

| TS file | test name | behaviour asserted (one line) | Go status | Go test or source |
|---|---|---|---|---|
| policy-packs-e2e.test.ts | resolves EU policy for a German visitor | DE gets eu policy, opt-in, strict scope, categories echoed, matchedBy country, GDPR | PARTIAL | api/api_test.go TestInitResolvesPolicy/germany asserts id, model, matchedBy, jurisdiction; scopeMode and categories echo in the init response not asserted |
| policy-packs-e2e.test.ts | resolves California policy via region match | US/CA gets opt-out, gpc true, matchedBy region, CCPA | COVERED | api/api_test.go TestInitResolvesPolicy/california; core/policy/presets_test.go TestPresetCaliforniaEnablesGPC |
| policy-packs-e2e.test.ts | resolves default policy for an unmatched country | JP gets default, model none, matchedBy default | COVERED | api/api_test.go TestInitResolvesPolicy/other us state falls to default; core/policy/presets_test.go TestPresetResolution/brazil gets world default |
| policy-packs-e2e.test.ts | resolves fallback policy when geo-location fails (null country) | no country header gets fallback, matchedBy fallback, countryCode null | COVERED | api/api_test.go TestInitResolvesPolicy/unknown geo falls back to europe |
| policy-packs-e2e.test.ts | resolves fallback when disableGeoLocation is enabled | geo disabled gets fallback policy, matchedBy fallback, location null, GDPR | PARTIAL | api/api_test.go TestInitGeoDisabledFallsBackToGDPR asserts GDPR and empty location; resolved policy and matchedBy fallback not asserted |
| policy-packs-e2e.test.ts | falls through to default when no fallback exists and geo fails | no fallback, null country gives default | COVERED | core/policy/resolve_test.go TestResolvePrecedence/default when no fallback and country unknown |
| policy-packs-e2e.test.ts | produces a valid snapshot token that round-trips through verify | token payload: policyId, fingerprint, matchedBy, country, jurisdiction, model, scopeMode, categories, gpc, proofConfig | PARTIAL | api/api_test.go TestSnapshotRoundTrip and TestSnapshotPayloadCarriesPolicyDetail (field presence, uiMode, country); values of policyId, fingerprint, matchedBy, jurisdiction, model, scopeMode, categories, gpc, proofConfig not asserted |
| policy-packs-e2e.test.ts | snapshot token for fallback policy contains matchedBy=fallback | fallback token has matchedBy fallback, policyId, null country | NOT COVERED | No Go test decodes a token issued for unknown geo |
| policy-packs-e2e.test.ts | does not produce a snapshot token when signingKey is not configured | no token without secret | COVERED | api/api_test.go TestSnapshotTokenAbsentWithoutSecret |
| policy-packs-e2e.test.ts | produces fingerprints consistent with the shared resolver | init fingerprint equals resolver fingerprint | PARTIAL | api/api_test.go TestInitResolvesPolicy asserts length 64 only; equality with policy.Resolve not asserted |
| policy-packs-e2e.test.ts | produces different fingerprints for different policies | DE and US/CA fingerprints differ | COVERED | api/api_test.go TestSnapshotForDifferentPolicyIsRejected (409 requires differing fingerprints; indirect) |
| policy-packs-e2e.test.ts | includes gpc=true in California policy and gpc=false in EU policy | init policy consent.gpc differs per policy | PARTIAL | core/policy/presets_test.go TestPresetCaliforniaEnablesGPC and core/policy/resolve_test.go TestResolveGPC at resolver level; init response gpc not asserted |
| policy-packs-e2e.test.ts | gpc value is preserved in snapshot token | token payload gpc true for California | NOT COVERED | api/snapshot.go sets GPC; field list in TestSnapshotPayloadCarriesPolicyDetail omits gpc |
| policy-packs-e2e.test.ts | no-banner mode when explicit empty pack is configured | empty pack: policy id no_banner, model none, no decision, no token | MISSING IN GO | Go omits policy, decision and token for an empty pack (decision and token parts match) but synthesizes no no_banner policy; untested |
| policy-packs-e2e.test.ts | region match takes priority over country match | US/CA gets region policy, US/NY gets country policy | COVERED | core/policy/resolve_test.go TestResolveRegionBeatsCountry |

## backend/src/handlers/policy/snapshot.test.ts

| TS file | test name | behaviour asserted (one line) | Go status | Go test or source |
|---|---|---|---|---|
| snapshot.test.ts | returns missing when the token is absent | absent token gives reason missing | COVERED | core/snapshot/snapshot_test.go TestVerifyFailures/empty |
| snapshot.test.ts | creates and verifies a valid token | 3 segments; iss, aud with tenant, sub, policyId, matchedBy, country, region, policyI18n, scopeMode, categories, preselected, bannerUi values | PARTIAL | core/snapshot/snapshot_test.go TestSignAndVerify (3 segments, policyId, fingerprint, issuer, exp) and api/api_test.go TestSnapshotPayloadCarriesPolicyDetail (field presence); tenant audience value, sub, region, policyI18n, preselected and bannerUi values not asserted |
| snapshot.test.ts | rejects tampered token payloads | modified payload gives invalid | PARTIAL | core/snapshot/snapshot_test.go TestVerifyFailures/tampered signature alters the signature segment; payload tamper not asserted |
| snapshot.test.ts | rejects expired tokens | expired token gives expired | COVERED | core/snapshot/snapshot_test.go TestVerifyFailures/expired |
| snapshot.test.ts | rejects tokens when the tenant context does not match | tenant ins_456 vs ins_123 gives invalid | COVERED | core/snapshot/snapshot_test.go TestVerifyFailures/foreign tenant |
| snapshot.test.ts | rejects tenant-scoped tokens when no tenant context is provided | tenant token verified with no tenant gives invalid | NOT COVERED | Verify handles it via audienceFor; core/snapshot/snapshot_test.go TestTenantScopedAudience tests the reverse (untenanted token against a tenant) |
| snapshot.test.ts | supports custom issuer and audience claims | custom issuer and audience round-trip | NOT COVERED | NewSigner and Config.SnapshotIssuer/SnapshotAudience support it; every Go test passes empty issuer and audience |

## Db registry and legal documents

Go paths are relative to /Users/thommorais/shed/journ/c15t/apps/base. TS paths are relative to /Users/thommorais/shed/c15t/packages.

## backend/src/db/tenant-scope.test.ts

| TS file | test name | behaviour asserted (one line) | Go status | Go test or source |
|---|---|---|---|---|
| tenant-scope.test.ts | create: should inject tenantId into created data | a create through the scope stamps tenantId on the row | COVERED | api/api_test.go TestWritesAreStampedWithConfiguredTenant (consent, subject, domain, consentPurpose, consentPolicy, runtimePolicyDecision, auditLog all carry tenantId) |
| tenant-scope.test.ts | createMany: should inject tenantId into all items | batch create stamps tenantId on every item | N/A | Go scope has no createMany; each record is built via scope.New (api/scope.go), covered by the stamping test above |
| tenant-scope.test.ts | findFirst: should add tenantId filter to where clause | caller where is AND-ed with tenantId | PARTIAL | api/scope_test.go TestScopeFilter "appends to an existing filter" covers the filter string; scope.FindFirst is never driven against a foreign-tenant row |
| tenant-scope.test.ts | findFirst: should use only tenantId filter when no original where | empty where becomes the tenantId condition alone | PARTIAL | api/scope_test.go TestScopeFilter "stands alone when the filter is empty" covers the string; scope.FindFirst with empty filter is not driven |
| tenant-scope.test.ts | findMany: should add tenantId filter to where clause | list query is AND-ed with tenantId | COVERED | api/scope_test.go TestScopeFilter plus api/api_test.go TestReadsAreScopedToConfiguredTenant (list consent returns 0 for a foreign-stamped row) |
| tenant-scope.test.ts | findMany: should handle findMany with no options | list with no filter is restricted to tenantId | COVERED | api/scope_test.go TestScopeFilter "stands alone when the filter is empty" (FindAll uses the same scopeFilter) |
| tenant-scope.test.ts | count: should add tenantId filter to where clause | count is restricted to tenantId | N/A | Go scope has no count; no handler counts rows |
| tenant-scope.test.ts | updateMany: should add tenantId filter to where clause | update where is AND-ed with tenantId and set is preserved | N/A | Go has no updateMany; updates are FindByID then Save (patchSubject), see the cross-tenant update row below |
| tenant-scope.test.ts | deleteMany: should add tenantId filter to where clause | delete where is AND-ed with tenantId | N/A | Go has no delete path in api/*.go |
| tenant-scope.test.ts | upsert: should add tenantId to where clause and create data | upsert filter and create payload both carry tenantId | N/A | Go has no upsert wrapper; find-or-create is scope.FindFirst plus scope.New, see the upsert integration row |
| tenant-scope.test.ts | transaction: should provide a tenant-scoped ORM inside transaction | tx handle stamps creates and filters reads | PARTIAL | api/api_test.go TestWritesAreStampedWithConfiguredTenant (consent write runs in scope.Tx and rows are stamped); reads inside Tx are not asserted to be filtered |
| tenant-scope.test.ts | data isolation (mock): should scope different tenants to their own data | two scopes stamp and filter with their own tenantId | PARTIAL | api/api_test.go TestWritesAreStampedWithConfiguredTenant and api/scope_test.go TestScopeParamsCarriesTenant use one tenant ("acme"); no test configures two tenants |
| tenant-scope.test.ts | integration: tenant A cannot see subjects created by tenant B | each tenant lists only its own subjects | PARTIAL | api/api_test.go TestScopeHidesForeignRowsFromEveryReadPath (list subjects 0, get subject 404 for foreign rows); own rows visible under a configured tenant are never asserted |
| tenant-scope.test.ts | integration: findFirst only returns records belonging to the querying tenant | foreign id lookup returns null, own returns the row | PARTIAL | TestScopeHidesForeignRowsFromEveryReadPath (get subject 404, check consent false); no positive lookup under a configured tenant; scope.FindByID foreign rejection (errNotOwned) has no direct test, and policy lookup by id for a foreign policy is untested |
| tenant-scope.test.ts | integration: count only counts records belonging to the querying tenant | count differs per tenant | N/A | no count in Go |
| tenant-scope.test.ts | integration: updateMany only affects the calling tenant's rows | tenant A update leaves B row unchanged, A row changed | PARTIAL | TestScopeHidesForeignRowsFromEveryReadPath "patch subject" asserts 404 on a foreign row; row-unchanged and own-row patch under a configured tenant are not asserted (TestPatchSubject runs with no tenant) |
| tenant-scope.test.ts | integration: deleteMany only deletes the calling tenant's rows | delete is tenant-limited | N/A | Go has no delete path |
| tenant-scope.test.ts | integration: upsert creates with tenantId and only matches own rows | same externalId under two tenants yields two rows, B does not update A | NOT COVERED | behaviour exists (findOrCreateSubject in api/store.go via scoped FindFirst, unique index idx_subject_external includes tenantId in migrations/1757520000_init_consent_schema.go); no test posts the same externalId under two tenants |
| tenant-scope.test.ts | integration: tenant A cannot update tenant B's row even with matching id | cross-tenant update by id is a no-op | PARTIAL | TestScopeHidesForeignRowsFromEveryReadPath "patch subject" 404; unchanged row not asserted |
| tenant-scope.test.ts | integration: tenant A cannot delete tenant B's row even with matching id | cross-tenant delete is a no-op | N/A | Go has no delete path |
| tenant-scope.test.ts | integration: transaction inherits tenant scope | rows created in a tx are visible to the owner and invisible to another tenant | PARTIAL | TestWritesAreStampedWithConfiguredTenant covers stamping inside Tx; invisibility to another tenant is covered only for rows restamped by SQL, not for tx-created rows; api/boundary_test.go TestHandlersCannotBypassTenantScoping forbids RunInTransaction outside the scope |
| tenant-scope.test.ts | integration: three tenants sharing same database are fully isolated | per-tenant counts and lists over one store | PARTIAL | no test with more than one configured tenant; foreign-row hiding covered by TestScopeHidesForeignRowsFromEveryReadPath; underlying store row count is N/A |

## backend/src/db/registry/consent-policy.test.ts

| TS file | test name | behaviour asserted (one line) | Go status | Go test or source |
|---|---|---|---|---|
| consent-policy.test.ts | findConsentPolicyById: should return policy when found by id | lookup by id returns the policy | PARTIAL | api/api_test.go TestLegalDocumentConsentAcceptsExplicitPolicyID asserts 201 only; it does not assert the stored consent references that policy (findOrCreatePolicy would also give 201) |
| consent-policy.test.ts | findConsentPolicyById: should return null when policy not found by id | unknown id yields no policy | COVERED | api/api_test.go TestConsentPolicyReferenceErrors "unknown policy id" (404 POLICY_NOT_FOUND, status asserted) |
| consent-policy.test.ts | findConsentPolicyById: should handle various policy id formats | ids of any shape pass through the lookup | N/A | id formats are PocketBase ids in Go |
| consent-policy.test.ts | findConsentPolicyById: should propagate database errors | a DB failure surfaces as an error | MISSING IN GO | api/policyref.go resolvePolicyRecord maps any FindByID error to 404 Policy not found, so a DB failure is reported as not found |
| consent-policy.test.ts | findOrCreatePolicy: should return existing active policy for given type | existing active policy of the type is reused, no create | COVERED | api/api_test.go TestConsentPolicyRowReuse (3 consents, 1 consentPolicy row) |
| consent-policy.test.ts | findOrCreatePolicy: should handle all valid policy types | existing policy is returned for each of the 7 types | PARTIAL | TestConsentPolicyRowReuse exercises cookie_banner and age_verification only; legal types go through proof/ref paths |
| consent-policy.test.ts | findOrCreatePolicy: should return most recent active policy when multiple exist | newest active by effectiveDate wins | PARTIAL | Go forbids two active rows per type (idx_policy_active; api/api_test.go TestOnlyOneActivePolicyPerType), so selection by date never arises; no ordering test |
| consent-policy.test.ts | findOrCreatePolicy: should create new policy with minimal fields | missing policy is created with version 1.0.0, given type, effectiveDate now, isActive true | PARTIAL | api/api_test.go TestConsentPolicyStartsAtVersionOne asserts version, type, isActive; effectiveDate = now is not asserted |
| consent-policy.test.ts | findOrCreatePolicy: should create policies for all valid types with correct defaults | every type is created with version 1.0.0 and active | PARTIAL | TestConsentPolicyStartsAtVersionOne (cookie_banner) and TestConsentPolicyRowReuse (age_verification row created); defaults not asserted for the other types |
| consent-policy.test.ts | findOrCreatePolicy: should propagate database findFirst errors | a lookup failure surfaces as an error | MISSING IN GO | api/store.go findOrCreatePolicy treats any FindFirst error as not found and goes on to create |
| consent-policy.test.ts | findOrCreatePolicy: should propagate database create errors | a create failure surfaces as an error | NOT COVERED | api/store.go returns the Save error (respondError gives 500); no test forces a policy save to fail |
| consent-policy.test.ts | database query construction: should construct correct query for policy lookup by id | findFirst called with a where function | N/A | ORM call shape |
| consent-policy.test.ts | database query construction: should construct correct query for active policy lookup by type | findFirst with where plus orderBy effectiveDate desc | N/A | ORM call shape; Go filters type and isActive in api/store.go |
| consent-policy.test.ts | edge cases: should handle concurrent policy creation requests | three concurrent calls all resolve with the type | NOT COVERED | no concurrency test in Go; duplicate active rows are blocked by idx_policy_active (TestOnlyOneActivePolicyPerType) but a racing second creator would error rather than resolve |
| consent-policy.test.ts | legal document policy helpers: findLatestPolicyByType performs a non-mutating lookup | latest active policy of a type is read without writes | PARTIAL | TestGetSubject and TestCheckConsentReportsExistingConsent assert isLatestPolicy via the active-policy lookup; no assertion that the lookup creates no row |
| consent-policy.test.ts | legal document policy helpers: syncCurrentLegalDocumentPolicy creates a new active release and deactivates the previous one | publish creates active row with hash, previous becomes inactive | COVERED | api/api_test.go TestSyncLegalDocument (v1 then v2, exactly one active, version 2.0.0) |
| consent-policy.test.ts | legal document policy helpers: syncCurrentLegalDocumentPolicy scopes suffixed variant deactivation to the exact type | publishing terms_and_conditions_b2b leaves terms_and_conditions_b2c active | NOT COVERED | api/document.go filters on type = docType exactly; no test publishes suffixed types |
| consent-policy.test.ts | legal document policy helpers: syncCurrentLegalDocumentPolicy is idempotent for the same release metadata | re-publishing identical release returns the existing row, no create | NOT COVERED | api/document.go reuses the row for the same type and version; no test re-publishes. Go keys on (type, version), TS on (type, hash) |
| consent-policy.test.ts | legal document policy helpers: syncCurrentLegalDocumentPolicy rejects conflicting metadata for the same release | same release with different version or effectiveDate is a conflict | PARTIAL | api/api_test.go TestSyncLegalDocumentRejectsHashChange asserts 409 for same version with a different hash only; same hash with a different version creates a new release, and a different effectiveDate for the same version and hash is overwritten, not rejected (api/document.go) |
| consent-policy.test.ts | legal document policy helpers: findOrCreateLegalDocumentPolicy creates historical releases as inactive when a latest release already exists | unseen release hash is stored inactive | MISSING IN GO | Go never creates a policy row from a consent receipt; unknown policyHash gives 404 (TestConsentPolicyReferenceErrors) and an inactive policy gives 400 (TestConsentRejectsInactivePolicy) |
| consent-policy.test.ts | legal document policy helpers: findOrCreateLegalDocumentPolicy does not promote the first seen receipt to active | first seen receipt is stored inactive | MISSING IN GO | same as above: no create-from-receipt path in api/policyref.go |

## backend/src/db/registry/domain.test.ts

| TS file | test name | behaviour asserted (one line) | Go status | Go test or source |
|---|---|---|---|---|
| domain.test.ts | findDomainByName: should return domain when found by name | lookup by name returns the row | N/A | no standalone lookup in Go; the find step of findOrCreateDomain is covered by TestConsentReusesSubjectAndDomain |
| domain.test.ts | findDomainByName: should return null when domain not found by name | unknown name yields null and a debug log | N/A | no standalone lookup; log is telemetry |
| domain.test.ts | findDomainByName: should handle empty string domain name | empty name yields null | N/A | no standalone lookup; Go rejects an empty domain at the route with 400 (TestConsentValidation "missing domain") |
| domain.test.ts | findOrCreateDomain: should return existing domain when found | existing domain reused, no create | COVERED | api/api_test.go TestConsentReusesSubjectAndDomain (3 consents, 1 domain row) |
| domain.test.ts | findOrCreateDomain: should create and return new domain | missing domain is created with the name | PARTIAL | TestConsentReusesSubjectAndDomain asserts one domain row exists and TestWritesAreStampedWithConfiguredTenant asserts a stamped row; the stored name is never asserted |
| domain.test.ts | findOrCreateDomain: should create domain with correct default values | create payload is id and name only | PARTIAL | same as above; stored name not asserted |
| domain.test.ts | findOrCreateDomain: should handle special domain names correctly | localhost, IPs, subdomains, hyphens, numeric names are accepted | NOT COVERED | Go accepts any name up to 255 chars (migrations domain.name); tests use only example.com and other.com |
| domain.test.ts | findOrCreateDomain: should throw HTTPException when domain creation fails | create returning null gives 503 DOMAIN_CREATION_FAILED | MISSING IN GO | api/errcodes.go has no DOMAIN_CREATION_FAILED; a failed domain save is a 500 INTERNAL_SERVER_ERROR (api/route.go respondError) |
| domain.test.ts | findOrCreateDomain: should throw HTTPException when domain creation returns undefined | same 503 for undefined | MISSING IN GO | same as above |
| domain.test.ts | findOrCreateDomain: should propagate database findFirst errors | lookup failure surfaces as an error | MISSING IN GO | api/store.go findOrCreateDomain treats any FindFirst error as not found and attempts the create |
| domain.test.ts | findOrCreateDomain: should propagate database create errors | create failure surfaces as an error | NOT COVERED | api/store.go returns the Save error; no test forces a domain save to fail (TestConsentRejectionLeavesNoRows fails later, on the action, and checks rollback only) |
| domain.test.ts | database query construction: should construct correct query for domain lookup by name | findFirst called with where function | N/A | ORM call shape |
| domain.test.ts | database query construction: should construct correct query for findOrCreateDomain lookup | findFirst called with where function | N/A | ORM call shape |
| domain.test.ts | edge cases: should handle domain names with various formats | a.b, long subdomain, multi-TLD, IDN punycode all stored as given | NOT COVERED | no test; Go stores name as received |
| domain.test.ts | edge cases: should maintain domain name case sensitivity | EXAMPLE.COM stored and returned in original case | NOT COVERED | no test; whether the PocketBase filter name = {:name} and unique index idx_domain_name compare case-sensitively was not verified |

## backend/src/db/registry/consent-purpose.test.ts

| TS file | test name | behaviour asserted (one line) | Go status | Go test or source |
|---|---|---|---|---|
| consent-purpose.test.ts | findOrCreateConsentPurposeByCode: should return existing consent purpose when found by code | existing purpose reused, no create | PARTIAL | api/api_test.go TestConsentReusesSubjectAndDomain posts "necessary" 3 times and would fail on idx_purpose_code if not reused, but no assertion counts consentPurpose rows after a repeat |
| consent-purpose.test.ts | findOrCreateConsentPurposeByCode: should handle different existing consent purpose types | essential, preferences, functional codes resolve to existing rows | NOT COVERED | resolvePurposes (api/store.go) accepts any code under permissive scope; tests use only necessary, measurement, marketing |
| consent-purpose.test.ts | findOrCreateConsentPurposeByCode: should create and return new consent purpose | missing code creates a purpose with that code | COVERED | api/api_test.go TestConsentWrite (2 categories give 2 consentPurpose rows) |
| consent-purpose.test.ts | findOrCreateConsentPurposeByCode: should create consent purpose with correct default values | create payload is id and code only | PARTIAL | TestConsentWrite counts rows; stored code is not asserted |
| consent-purpose.test.ts | findOrCreateConsentPurposeByCode: should handle special consent purpose codes correctly | codes with hyphens, dots, underscores are created as given | NOT COVERED | no test with such codes |
| consent-purpose.test.ts | findOrCreateConsentPurposeByCode: should throw HTTPException when consent purpose creation fails | null create gives 500 PURPOSE_CREATION_FAILED with purposeCode | MISSING IN GO | no PURPOSE_CREATION_FAILED code in api/errcodes.go; a failed save is a generic 500 |
| consent-purpose.test.ts | findOrCreateConsentPurposeByCode: should throw HTTPException when consent purpose creation returns undefined | same for undefined | MISSING IN GO | same as above |
| consent-purpose.test.ts | findOrCreateConsentPurposeByCode: should propagate database findFirst errors | lookup failure surfaces as an error | MISSING IN GO | api/store.go resolvePurposes treats any FindFirst error as not found and creates |
| consent-purpose.test.ts | findOrCreateConsentPurposeByCode: should propagate database create errors | create failure surfaces as an error | NOT COVERED | api/store.go returns the Save error; no test forces it |
| consent-purpose.test.ts | database query construction: should construct correct query for consent purpose lookup by code | findFirst called with where function | N/A | ORM call shape |
| consent-purpose.test.ts | edge cases: should handle consent purpose codes with various formats | single char, long, uppercase, mixed codes are stored as given | NOT COVERED | no test; core/consent/consent_test.go TestBuildRecordsEvidence asserts trim and dedupe only |
| consent-purpose.test.ts | edge cases: should maintain code case sensitivity | Analytics_Tracking stored in original case | NOT COVERED | no test; case-sensitivity of the lookup and idx_purpose_code was not verified |
| consent-purpose.test.ts | edge cases: should handle empty string code gracefully | empty code creates a purpose with code "" | MISSING IN GO | core/consent/consent.go dedupeTrimmed drops blank categories, so no purpose is created for an empty code |

## backend/src/db/registry/subject.test.ts

| TS file | test name | behaviour asserted (one line) | Go status | Go test or source |
|---|---|---|---|---|
| subject.test.ts | when subjectId is provided: should return existing subject when found | consent with a known subjectId reuses that subject | NOT COVERED | api/store.go findOrCreateSubject uses FindByID; no test posts a consent with an existing subjectId |
| subject.test.ts | when subjectId is provided: should create new subject when subjectId not found | unknown client subjectId creates the subject with that id, anonymous | MISSING IN GO | Go rejects an unknown subjectId with 400 (api/api_test.go TestConsentValidation "unknown subject id") |
| subject.test.ts | when subjectId is provided: should create new subject with externalId when both IDs provided but subject not found | unknown subjectId plus externalId creates subject with provider external | MISSING IN GO | same 400 rejection |
| subject.test.ts | when only externalSubjectId is provided: should create a new subject with external ID | externalId only creates a subject carrying the externalId | PARTIAL | TestConsentWrite and TestConsentReusesSubjectAndDomain create it; Go reuses an existing subject for the same externalId where TS always creates, and Go does not set identityProvider on create |
| subject.test.ts | when only externalSubjectId is provided: should use custom identity provider when specified | identityProvider from the request is stored | MISSING IN GO | consentRequest (api/routes.go) has no identityProvider field; only PATCH sets it (TestPatchSubject) |
| subject.test.ts | when only externalSubjectId is provided: should default identityProvider to "external" | omitted provider becomes external on create | MISSING IN GO | api/store.go does not set identityProvider on create; the default exists only in patchSubject (api/subject.go) and is untested |
| subject.test.ts | when no identifiers are provided: should create a new anonymous subject | no ids creates an anonymous subject | MISSING IN GO | Go returns 400 "subjectId or externalId is required" (TestConsentValidation "missing subject and external id") |
| subject.test.ts | when no identifiers are provided: should create anonymous subject when no arguments provided | empty argument object creates an anonymous subject | MISSING IN GO | same 400 |
| subject.test.ts | edge cases and error handling: should handle empty string externalSubjectId as falsy | "" externalId falls through to anonymous creation | MISSING IN GO | "" is treated as absent but then yields 400, not an anonymous subject |
| subject.test.ts | edge cases and error handling: should handle empty string subjectId as falsy | "" subjectId falls through to anonymous creation | MISSING IN GO | same 400 |
| subject.test.ts | database query construction: should construct correct findFirst query for subjectId lookup | findFirst called with where function | N/A | ORM call shape |
| subject.test.ts | database query construction: should construct correct create call for externalSubjectId | create called with id, externalId, provider external | PARTIAL | creation with externalId is covered as above; the provider value is not set in Go |

## backend/src/db/registry/utils/generate-id.test.ts

| TS file | test name | behaviour asserted (one line) | Go status | Go test or source |
|---|---|---|---|---|
| generate-id.test.ts | should return unique ID on first attempt when no collision exists | prefixed base58 id, one collision probe | N/A | id generation format Go does not share (PocketBase record ids) |
| generate-id.test.ts | should retry when ID collision occurs and return unique ID on second attempt | retry after one collision | N/A | no collision-retry loop in Go; the primary key rejects duplicates |
| generate-id.test.ts | should handle multiple collisions before finding unique ID | four probes after three collisions | N/A | same |
| generate-id.test.ts | should work with different model types and use correct prefixes | per-model prefixes log_, cns_, pol_, pur_, dom_, sub_ | N/A | Go ids carry no model prefix |
| generate-id.test.ts | should call findFirst with correct where clause function | probe is where id = generated id | N/A | ORM call shape |
| generate-id.test.ts | should generate different IDs on subsequent calls | successive ids differ | N/A | id generation by PocketBase |
| generate-id.test.ts | should throw an error when max retries is exceeded | error and log after maxRetries collisions | N/A | no retry loop in Go |
| generate-id.test.ts | should respect custom retry options | baseDelay backoff option honoured | N/A | no retry loop in Go |

## schema/src/domain/consent-policy.test.ts

| TS file | test name | behaviour asserted (one line) | Go status | Go test or source |
|---|---|---|---|---|
| consent-policy.test.ts (schema) | legalDocumentPolicyTypeSchema: accepts the base legal-document type privacy_policy | base type is a legal document type | COVERED | api/api_test.go TestConsentPolicyType "legal document without proof" (409 requires consent.IsLegalDocumentType true) and core/consent/policytype_test.go TestPolicyTypeValid "privacy policy" |
| consent-policy.test.ts (schema) | legalDocumentPolicyTypeSchema: accepts the base legal-document type dpa | base type is a legal document type | PARTIAL | TestPolicyTypeValid "dpa" asserts ValidPolicyType, which matches the base list before IsLegalDocumentType; IsLegalDocumentType("dpa") is not asserted |
| consent-policy.test.ts (schema) | legalDocumentPolicyTypeSchema: accepts the base legal-document type terms_and_conditions | base type is a legal document type | PARTIAL | TestPolicyTypeValid "terms" asserts ValidPolicyType only; IsLegalDocumentType on the base value is not asserted |
| consent-policy.test.ts (schema) | legalDocumentPolicyTypeSchema: accepts the suffixed legal-document variant terms_and_conditions_b2b | suffixed variant accepted | COVERED | TestConsentPolicyType "suffixed legal document without proof" (409, so the type is accepted and recognised as legal) |
| consent-policy.test.ts (schema) | legalDocumentPolicyTypeSchema: accepts the suffixed legal-document variant terms_and_conditions_b2c | suffixed variant accepted | COVERED | TestPolicyTypeValid "suffixed legal document" |
| consent-policy.test.ts (schema) | legalDocumentPolicyTypeSchema: accepts the suffixed legal-document variant privacy_policy_v2 | suffixed variant accepted | COVERED | TestPolicyTypeValid "suffixed privacy policy" (privacy_policy_eu, same rule) |
| consent-policy.test.ts (schema) | legalDocumentPolicyTypeSchema: accepts the suffixed legal-document variant dpa_2026 | suffixed variant accepted | COVERED | TestPolicyTypeValid "suffixed dpa" (dpa_extra, same rule) |
| consent-policy.test.ts (schema) | legalDocumentPolicyTypeSchema: rejects terms_and_conditions2 | suffix without underscore boundary rejected | COVERED | TestPolicyTypeValid "suffix without underscore boundary" |
| consent-policy.test.ts (schema) | legalDocumentPolicyTypeSchema: rejects privacy_policyx | suffix without underscore boundary rejected | PARTIAL | boundary rule is asserted only for the terms_and_conditions prefix |
| consent-policy.test.ts (schema) | legalDocumentPolicyTypeSchema: rejects terms_and_conditions_ | empty suffix rejected | COVERED | TestPolicyTypeValid "empty suffix" and TestConsentPolicyType "empty suffix" (400) |
| consent-policy.test.ts (schema) | legalDocumentPolicyTypeSchema: rejects privacy_policy_ | empty suffix rejected | PARTIAL | empty suffix asserted only for the terms_and_conditions prefix |
| consent-policy.test.ts (schema) | legalDocumentPolicyTypeSchema: rejects dpa_ | empty suffix rejected | PARTIAL | empty suffix asserted only for the terms_and_conditions prefix |
| consent-policy.test.ts (schema) | legalDocumentPolicyTypeSchema: rejects terms | bare prefix fragment rejected | PARTIAL | not asserted; TestPolicyTypeValid "unknown" (shrug) takes the same branch |
| consent-policy.test.ts (schema) | legalDocumentPolicyTypeSchema: rejects empty string | empty string rejected | COVERED | TestPolicyTypeValid "empty" |
| consent-policy.test.ts (schema) | legalDocumentPolicyTypeSchema: rejects cookie_banner | non-legal type fails the legal-document check | PARTIAL | IsLegalDocumentType is false for it (TestConsentPolicyType "default when omitted" needs no proof), but PUT /legal-documents/{type}/current validates with consent.ValidPolicyType (api/document.go) and so accepts cookie_banner; untested |
| consent-policy.test.ts (schema) | legalDocumentPolicyTypeSchema: rejects marketing_communications | non-legal type fails the legal-document check | PARTIAL | same: predicate not asserted for this type, and the publish route accepts it |
| consent-policy.test.ts (schema) | legalDocumentPolicyTypeSchema: rejects the non-string value 42 | non-string rejected | N/A | Go field is a string; a JSON number fails body binding (400), untested |
| consent-policy.test.ts (schema) | legalDocumentPolicyTypeSchema: rejects the non-string value null | non-string rejected | N/A | statically typed in Go |
| consent-policy.test.ts (schema) | legalDocumentPolicyTypeSchema: rejects the non-string value undefined | non-string rejected | N/A | statically typed in Go; absent policyType defaults to cookie_banner |
| consent-policy.test.ts (schema) | legalDocumentPolicyTypeSchema: rejects the non-string value {} | non-string rejected | N/A | statically typed in Go |
| consent-policy.test.ts (schema) | legalDocumentPolicyTypeSchema: rejects the non-string value ["privacy_policy"] | non-string rejected | N/A | statically typed in Go |
| consent-policy.test.ts (schema) | subjectPolicyBasedInputSchema: accepts a suffixed legal-document type | suffixed type with policyHash is a valid consent input | PARTIAL | TestLegalDocumentConsentAcceptsPolicyHash covers privacy_policy with policyHash; a suffixed type with policyHash is not exercised (TestConsentPolicyType suffixed case sends no proof and expects 409) |
| consent-policy.test.ts (schema) | consentPolicySchema: accepts a stored policy with a suffixed legal-document type | policy row with suffixed type is valid | NOT COVERED | Go stores any type string and the publish route accepts suffixed types, but no test publishes or reads one |
| consent-policy.test.ts (schema) | postSubjectInputSchema variant routing: routes a suffixed legal-document type to the policy-based branch | suffixed type with policyHash parses and keeps its type | PARTIAL | Go has one request struct; the suffixed type is accepted past validation (409 in TestConsentPolicyType) but the 201 path with proof is untested |
| consent-policy.test.ts (schema) | postSubjectInputSchema variant routing: still rejects an unknown consent type | unknown type fails validation | COVERED | TestConsentPolicyType "unknown type" (400) |
| consent-policy.test.ts (schema) | postSubjectOutputSchema: accepts a response with a suffixed legal-document type | output schema accepts suffixed type | N/A | wire shape only; consentResponse (api/routes.go) carries no type field |

## backend/src/handlers/legal-document/snapshot.test.ts

Go has only the policy snapshot token (core/snapshot/snapshot.go). It carries policyId and fingerprint, not type, version, hash or effectiveDate, and its default audience is c15t-policy-snapshot.

| TS file | test name | behaviour asserted (one line) | Go status | Go test or source |
|---|---|---|---|---|
| snapshot.test.ts | returns missing when the token is absent | empty token gives reason missing | COVERED | core/snapshot/snapshot_test.go TestVerifyFailures "empty" (ReasonMissing); api TestSnapshotRequiredRejectsBadTokens "missing" (409) |
| snapshot.test.ts | creates and verifies a valid token | 3-segment JWT; iss c15t; aud suffixed with tenant; sub, version, hash, effectiveDate claims | PARTIAL | TestSignAndVerify asserts 3 segments, default issuer c15t, round trip; audience prefix differs, and version, hash, effectiveDate claims do not exist in Go (sub is the policy id) |
| snapshot.test.ts | creates and verifies a suffixed legal-document type variant | type claim round-trips for terms_and_conditions_b2b | MISSING IN GO | no legal-document token and no type claim in Payload |
| snapshot.test.ts | rejects tampered token payloads | modified payload gives reason invalid | PARTIAL | TestVerifyFailures "tampered signature" and api TestSnapshotRequiredRejectsBadTokens "tampered" alter the signature, not the payload; the HMAC covers both (core/snapshot/snapshot.go Verify) |
| snapshot.test.ts | rejects expired tokens | expired token gives reason expired | COVERED | TestVerifyFailures "expired" (ReasonExpired; clock advanced instead of a negative ttl, since NewSigner coerces ttl <= 0 to the default) |
| snapshot.test.ts | rejects tokens when the tenant context does not match | other tenant gives reason invalid | COVERED | TestVerifyFailures "foreign tenant" and TestTenantScopedAudience |
| snapshot.test.ts | supports custom issuer and audience claims | custom iss and aud sign and verify; claims echoed verbatim | NOT COVERED | NewSigner takes issuer and audience (api/config_env_test.go only parses the env vars); no sign/verify test with custom values. Go appends ":tenantId" to a custom audience (audienceFor), TS echoes it verbatim |

## backend/src/routes/legal-document.test.ts

| TS file | test name | behaviour asserted (one line) | Go status | Go test or source |
|---|---|---|---|---|
| legal-document.test.ts | syncs the current release when the request is authenticated | PUT with a valid key returns 200 and the policy body, registry gets parsed date | PARTIAL | api/api_test.go TestSyncLegalDocument asserts 200, type, version, isActive, one active row; response id, hash and effectiveDate are not asserted |
| legal-document.test.ts | rejects requests without API key authentication | PUT without an API key returns 401 | PARTIAL | api/api_test.go TestPublishableKeyCannotReachPersonalData "publish legal document" asserts 403 for a publishable key; 401 for no or bad key is asserted on init (TestInitRequiresAuth) and other routes, not on this route |
| legal-document.test.ts | returns conflict when the synced release metadata does not match the existing row | 409 with the conflict message | PARTIAL | api/api_test.go TestSyncLegalDocumentRejectsHashChange asserts 409 only; conflict message and code LEGAL_DOCUMENT_RELEASE_CONFLICT are not asserted, and the trigger differs (same version with another hash) |

## Middleware, edge and utils

Coverage: TS infra tests vs Go port (apps/base)

Method. Every COVERED row names a Go test I opened. Behaviour claims for untested Go code (NOT COVERED, and the "Go does X" half of PARTIAL / MISSING rows) come from reading core/origin/origin.go and core/request/ip.go and from a probe: I copied those two files into scratchpad/probe and ran an input table through Parse().Allows() and MaskIP(). No repo file was edited. Paths below are relative to apps/base unless they start with TS.

Origin matching in Go, as read and probed:
- An entry with a scheme (https://nina.app) matches the same scheme and port only. Default ports (:80/:443/:80 for ws, :443 for wss) are dropped on both sides. A leading www. is dropped on both sides, on every scheme.
- An entry without a scheme (example.com, localhost:3000) is stored as a bare host and never equals a candidate, because the candidate always carries a scheme. Probe: Parse("example.com").Allows("https://example.com") is false. Schemeless wildcards (*.example.com) do work and match any scheme.
- A wildcard covers subdomains only. It compares against the www-stripped candidate, so https://*.nina.dev rejects https://www.nina.dev (probe false).
- Wildcard entries keep the port in the host, so *.example.com:8443 matches only :8443 and *.example.com rejects any origin that carries a port.
- An empty list or "*" allows everything. Origin binding applies only to publishable keys (api/route.go), and a restricted publishable key with no Origin header gets 403.

## middleware/cors/cors.test.ts
CORS response headers and echo are PocketBase (apis.Serve, --origins). Rows that only assert the matcher are compared to core/origin.

| TS file | test name | behaviour asserted (one line) | Go status | Go test or source |
|---|---|---|---|---|
| cors.test.ts | configuration shape: returns expected defaults when no trustedOrigins provided | default options: credentials true, maxAge 600, allowHeaders list, methods list, origin '*' | N/A | CORS headers are produced by PocketBase, not by our code |
| cors.test.ts | wildcard "*": allows any concrete origin and echoes it back | '*' allows any origin, echoed; empty origin returns '*' | N/A | Echo is PocketBase. Matcher half: core/origin TestStarAllowsEverything asserts Parse("*") allows any origin |
| cors.test.ts | wildcard subdomains: allows apex, www, and wildcard subdomains when apex and wildcard are configured | entries https://example.com plus https://*.example.com allow apex, www and app | PARTIAL | Missing: no Go test combines an exact and a wildcard entry. Probe: apex, www and app.example.com all true. Apex and www are covered separately by TestExactMatch and TestWwwIsIgnored |
| cors.test.ts | wildcard subdomains: does not allow apex domains from wildcard-only configuration | https://*.example.com rejects https://example.com, allows app subdomain | COVERED | core/origin TestWildcard ("bare domain does not match", "subdomain matches") |
| cors.test.ts | wildcard subdomains: allows www from wildcard-only configuration | https://*.example.com allows https://www.example.com | MISSING IN GO | Probe: Allows("https://www.example.com") is false for entry https://*.example.com, because normalize() strips www before the wildcard check. Same bug the TS test was written to prevent |
| cors.test.ts | wildcard subdomains: does not widen malformed wildcard entries | www.* does not become allow-all, www.*.example.com does not widen | NOT COVERED | Probe: www.* rejects https://evil.com, www.*.example.com rejects evil.example.com and evil.com. No Go test |
| cors.test.ts | wildcard subdomains: rejects similar domains that are not subdomains | badexample.com and example.com.evil.com rejected by *.example.com | PARTIAL | TestWildcard "suffix lookalike is rejected" (evilnina.app). Missing: example.com.evil.com style input (probe: false) |
| cors.test.ts | specific origins: allows trusted origin and rejects untrusted | http://localhost:3002 allowed, http://malicious-site.com rejected | COVERED | core/origin TestExactMatch (evil.com rejected, listed origin allowed) |
| cors.test.ts | specific origins: treats localhost variants (ports, IPs) as trusted when "localhost" provided | entry localhost trusts localhost:1234, 127.0.0.1:3000, [::1]:3000 | MISSING IN GO | Probe: entry "localhost" allows none of the three. No loopback equivalence in core/origin |
| cors.test.ts | www and non-www variants: allows www when non-www is trusted | entry http://c15t.com allows http://www.c15t.com | COVERED | core/origin TestWwwIsIgnored (https://nina.app allows https://www.nina.app); api TestPublishableKeyIsBoundToOrigins "www of configured origin" |
| cors.test.ts | www and non-www variants: allows non-www when www is trusted | entry http://www.c15t.com allows http://c15t.com | NOT COVERED | Probe: true. No Go test with a www entry |
| cors.test.ts | www and non-www variants: allows both variants when a schemeless www entry is trusted | entry www.c15t.com allows http://c15t.com and http://www.c15t.com | MISSING IN GO | Probe: both false, schemeless entries never match |
| cors.test.ts | ports and protocols: matches with exact port when provided | entry localhost:3002 allows :3002, rejects :4000 | PARTIAL | TestSchemeAndPortAreSignificant covers an other-port rejection against a portless scheme entry. Missing: entry that carries a port is untested (probe: http://localhost:3002 entry works), schemeless localhost:3002 never matches (probe false) |
| cors.test.ts | ports and protocols: is protocol-agnostic for host comparison | entry example.com allows http and https, www included | MISSING IN GO | Go is scheme-strict: TestSchemeAndPortAreSignificant "http is not https" asserts the opposite. Schemeless entry never matches |
| cors.test.ts | invalid or missing origins: returns null for clearly invalid origins | ::::invalid:::: rejected | NOT COVERED | Probe: false. No Go test for a malformed Origin value |
| cors.test.ts | invalid or missing origins: returns "*" when origin header is missing/empty | '*' config with empty origin returns '*' | N/A | CORS echo is PocketBase. Auth-side equivalent: api TestPublishableKeyWithoutOriginsIsUnrestricted (empty Origin passes) and TestPublishableKeyIsBoundToOrigins "missing origin" (403 when the key has a list) |

## middleware/cors/is-origin-trusted.test.ts
Go status here is judged on matcher behaviour against core/origin tests. "Schemeless" means the TS input has no scheme, which Go never matches for exact entries.

| TS file | test name | behaviour asserted (one line) | Go status | Go test or source |
|---|---|---|---|---|
| is-origin-trusted.test.ts | should match exact origins | example.com matches https://example.com, not other.com | PARTIAL | TestExactMatch covers scheme entries. Missing: schemeless entry (probe: false) |
| is-origin-trusted.test.ts | should handle origins with trailing slashes | https://example.com/ and // match example.com | PARTIAL | TestTrailingSlashIsIgnored covers a trailing slash on the configured entry only. Origin side and double slash untested (probe: "https://example.com//" does not match, schemeless entry never matches) |
| is-origin-trusted.test.ts | should handle origins with paths | https://example.com/path and /path/subpath match example.com | MISSING IN GO | Probe: path stays in the host, no match for entry example.com. Browsers never send a path in Origin, so likely harmless, but behaviour differs |
| is-origin-trusted.test.ts | should handle multiple trusted domains | two entries both match, third rejected | PARTIAL | TestExactMatch has two scheme entries and a rejection. Missing: schemeless form |
| is-origin-trusted.test.ts | should handle wildcard subdomains | *.example.com matches sub and other.sub, not bare, not other.com | COVERED | TestWildcard (subdomain, deep subdomain, bare domain, different domain). Go tests use https://*.nina.app, schemeless *.x works per probe |
| is-origin-trusted.test.ts | should handle different protocols | example.com matches http and wss origins | MISSING IN GO | Go is scheme-strict (TestSchemeAndPortAreSignificant asserts http != https). Schemeless entry never matches |
| is-origin-trusted.test.ts | should handle ports in origins when the trusted domain is host-only | example.com matches https://example.com:3000 and http://example.com:8080 | MISSING IN GO | Go treats port as significant: TestSchemeAndPortAreSignificant "other port" asserts the opposite for a scheme entry |
| is-origin-trusted.test.ts | should scope origins to explicit trusted ports | localhost:3000 matches :3000 not :5173; *.example.com:8443 matches :8443 not :9443 | PARTIAL | Covered: other-port rejection only for a portless entry. Probe: *.example.com:8443 works (true/false as TS). Missing: no Go test with a port on the entry, schemeless localhost:3000 never matches |
| is-origin-trusted.test.ts | should honor explicitly configured default ports | example.com:443 matches https://example.com, not :8443; example.com:80 matches http only | PARTIAL | TestSchemeAndPortAreSignificant covers explicit :443 on the origin side. Missing: default port written on the entry (probe: https://example.com:443 entry matches https://example.com), schemeless form never matches |
| is-origin-trusted.test.ts | should handle empty trusted domains array | empty list matches nothing | MISSING IN GO | Inverted by design: Parse("") is unrestricted, asserted by TestAllowedWhenUnrestricted. Matches TS createCORSOptions() default '*', not isOriginTrusted([]) |
| is-origin-trusted.test.ts | should handle invalid origin formats | invalid-url and '' rejected | PARTIAL | '' covered by TestExactMatch (empty origin, restricted list). 'invalid-url' untested (probe: false) |
| is-origin-trusted.test.ts | should handle case sensitivity | EXAMPLE.com entry matches example.com and EXAMPLE.COM | PARTIAL | TestCaseAndWhitespaceAreNormalised covers scheme entries on both sides. Schemeless entry never matches |
| is-origin-trusted.test.ts | should allow www and non-www exact domain variants | www.example.com matches example.com entry and reverse | PARTIAL | TestWwwIsIgnored covers entry without www, origin with www. Reverse untested (probe true for scheme entries). Schemeless never matches |
| is-origin-trusted.test.ts | should handle subdomain levels with wildcards | a.b.example.com and a.example.com match, bare does not | COVERED | TestWildcard "deep subdomain matches", "subdomain matches", "bare domain does not match" |
| is-origin-trusted.test.ts | multiple subdomain levels: should match base domain when explicitly listed | my-site.com matches https://my-site.com | PARTIAL | TestExactMatch covers scheme entries. Schemeless entry never matches |
| is-origin-trusted.test.ts | multiple subdomain levels: should match single-level subdomain with wildcard pattern | *.my-site.com matches foobar.my-site.com | COVERED | TestWildcard "subdomain matches" |
| is-origin-trusted.test.ts | multiple subdomain levels: should match multi-level subdomain with wildcard pattern | *.my-site.com matches foo.bar.my-site.com | COVERED | TestWildcard "deep subdomain matches" |
| is-origin-trusted.test.ts | multiple subdomain levels: should match three-level subdomain with wildcard pattern | *.my-site.com matches a.b.c.my-site.com | COVERED | TestWildcard "deep subdomain matches" (two levels asserted, three untested but same suffix check; probe true) |
| is-origin-trusted.test.ts | multiple subdomain levels: should not match base domain with wildcard pattern | *.my-site.com rejects my-site.com | COVERED | TestWildcard "bare domain does not match" |
| is-origin-trusted.test.ts | multiple subdomain levels: should not match similar domain that is not a subdomain | notmy-site.com and foobar-my-site.com rejected | COVERED | TestWildcard "suffix lookalike is rejected" (evilnina.app, same dot-anchored suffix check; hyphen variant untested, probe false) |
| is-origin-trusted.test.ts | multiple subdomain levels: should match both base domain and subdomains when both are configured | my-site.com plus *.my-site.com match apex, sub, deep sub | PARTIAL | No Go test combines exact and wildcard entries. Probe: scheme form true, schemeless apex entry never matches |

## middleware/cors/app-scheme.test.ts

| TS file | test name | behaviour asserted (one line) | Go status | Go test or source |
|---|---|---|---|---|
| app-scheme.test.ts | isOriginTrusted: trusts an app-scheme origin listed verbatim | capacitor://, ionic://, myapp:// localhost trusted when listed | NOT COVERED | Probe: capacitor://localhost and ionic://localhost entries match themselves. No Go test uses a non-http scheme |
| app-scheme.test.ts | isOriginTrusted: does not let one app-scheme entry trust other hosts | capacitor://localhost entry rejects capacitor://evil.com | NOT COVERED | Probe: false. No Go test |
| app-scheme.test.ts | isOriginTrusted: does not match across schemes | capacitor entry rejects ionic://localhost and https://localhost | NOT COVERED | Probe: both false. Go scheme strictness is tested only for http vs https (TestSchemeAndPortAreSignificant) |
| app-scheme.test.ts | isOriginTrusted: matches app-scheme hosts verbatim, without www equivalence | capacitor://www.localhost vs capacitor://localhost rejected both ways | MISSING IN GO | Probe: both directions true, normalize() strips www for every scheme |
| app-scheme.test.ts | isOriginTrusted: keeps www equivalence for web entries | https://www.example.com matches example.com and reverse | PARTIAL | TestWwwIsIgnored covers entry without www with a scheme. Reverse untested, schemeless entries never match |
| app-scheme.test.ts | isOriginTrusted: leaves entries without an app scheme protocol-agnostic | entry localhost trusts capacitor://localhost, *.example.com trusts capacitor://app.example.com | MISSING IN GO | Probe: entry localhost does not match capacitor://localhost (false). The *.example.com half is true in Go but untested |
| app-scheme.test.ts | isOriginTrusted: keeps web origins protocol-agnostic | example.com and https://example.com match http, https, wss variants | MISSING IN GO | Go is scheme-strict, probe: https://example.com entry rejects http:// and wss:// |
| app-scheme.test.ts | isOriginTrusted: still trusts the Android WebView origin | http://localhost entry matches http://localhost | NOT COVERED | Probe: true. No Go test |
| app-scheme.test.ts | createCORSOptions: echoes an app-scheme origin that is trusted | CORS origin echo for capacitor://localhost | N/A | CORS echo is PocketBase. Matcher equivalent is the row above, NOT COVERED |
| app-scheme.test.ts | createCORSOptions: rejects other hosts on the same app scheme | CORS returns null for capacitor://evil.com | N/A | CORS is PocketBase. Matcher: NOT COVERED row above |
| app-scheme.test.ts | createCORSOptions: rejects other schemes on the same host | CORS returns null for ionic:// and https:// localhost | N/A | CORS is PocketBase. Matcher: NOT COVERED row above |
| app-scheme.test.ts | createCORSOptions: supports a Capacitor app alongside its web origins | mixed list echoes all three origins | N/A | CORS is PocketBase. Publishable-key binding with mixed schemes has no Go test |
| app-scheme.test.ts | createCORSOptions: does not expand app schemes with a www variant | capacitor://www.localhost rejected | N/A | CORS is PocketBase. Matcher half is MISSING IN GO (www row above) |

## middleware/process-ip/index.test.ts
Go side: core/request/ip_test.go (TestMaskIP, TestMaskIPIsIdempotent, TestClientIP). TS null return is "" in Go.

| TS file | test name | behaviour asserted (one line) | Go status | Go test or source |
|---|---|---|---|---|
| index.test.ts | maskIpAddress IPv4: should mask the last octet of a standard IPv4 address | 192.168.1.100 -> 192.168.1.0 | COVERED | TestMaskIP "ipv4 zeroes last octet" |
| index.test.ts | maskIpAddress IPv4: should mask the last octet of localhost | 127.0.0.1 -> 127.0.0.0 | NOT COVERED | Probe: 127.0.0.0, same code path as the covered case |
| index.test.ts | maskIpAddress IPv4: should mask the last octet of a public IP | 8.8.8.8 -> 8.8.8.0 | NOT COVERED | Probe: 8.8.8.0, same code path as the covered case |
| index.test.ts | maskIpAddress IPv4: should handle IP with last octet already zero | 10.0.0.0 unchanged | COVERED | TestMaskIP "ipv4 already zero" |
| index.test.ts | maskIpAddress IPv4: should handle IP with max values | 255.255.255.255 -> 255.255.255.0 | NOT COVERED | Probe: 255.255.255.0 |
| index.test.ts | maskIpAddress IPv6: should mask the last 80 bits of a full IPv6 address | full form -> 2001:db8:85a3:: | COVERED | TestMaskIP "ipv6 full form" |
| index.test.ts | maskIpAddress IPv6: should mask a compressed IPv6 address | 2001:db8:85a3::1 -> 2001:db8:85a3:: | COVERED | TestMaskIP "ipv6 keeps first 48 bits" |
| index.test.ts | maskIpAddress IPv6: should handle localhost IPv6 | ::1 -> :: | COVERED | TestMaskIP "ipv6 loopback" |
| index.test.ts | maskIpAddress IPv6: should handle full zeros IPv6 | :: -> :: | NOT COVERED | Probe: "::" |
| index.test.ts | maskIpAddress IPv6: should mask IPv6 with leading zeros compressed | ::ffff:0:0:1 -> :: | NOT COVERED | Probe: "::" (netip treats it as plain IPv6, not 4in6) |
| index.test.ts | maskIpAddress IPv4-mapped: should mask the IPv4 portion of IPv4-mapped IPv6 | ::ffff:192.168.1.100 -> ::ffff:192.168.1.0 | COVERED | TestMaskIP "ipv4 mapped ipv6" |
| index.test.ts | maskIpAddress IPv4-mapped: should handle IPv4-mapped IPv6 localhost | ::ffff:127.0.0.1 -> ::ffff:127.0.0.0 | NOT COVERED | Probe: ::ffff:127.0.0.0 |
| index.test.ts | maskIpAddress edge cases: should return null for null input | null -> null | N/A | Go takes a string, no null input |
| index.test.ts | maskIpAddress edge cases: should return null for empty string | '' -> null | COVERED | TestMaskIP "empty stays empty" (returns "") |
| index.test.ts | maskIpAddress edge cases: should handle malformed IPv4 gracefully | 192.168.1 returned unchanged | PARTIAL | TestMaskIP "garbage passes through" asserts unparseable input unchanged (not-an-ip). Probe: 192.168.1 unchanged. Difference: TS masks any 4-part dotted string, Go returns unparseable 4-part strings (e.g. 999.1.1.1) unmasked. Untested |
| index.test.ts | getIpAddress IP extraction: should extract and mask IP from x-forwarded-for header by default | first entry of chain masked | COVERED | TestClientIP "takes first entry of a forwarded chain" |
| index.test.ts | getIpAddress IP extraction: should extract and mask IP from cf-connecting-ip header by default | cf header masked | COVERED | TestClientIP "cloudflare header" |
| index.test.ts | getIpAddress IP extraction: should return null when no IP headers present | no headers -> null | COVERED | TestClientIP "no headers returns empty" |
| index.test.ts | getIpAddress IP tracking disabled: should return null when IP tracking is disabled | tracking false -> null | COVERED | TestClientIP "tracking disabled returns empty"; api TestConsentIPOptions "tracking disabled stores nothing" |
| index.test.ts | getIpAddress IP masking enabled: should mask IPv4 address when masking is enabled | masking true masks IPv4 | COVERED | TestClientIP "masks by default" (Go has no explicit masking=true option; default is on) |
| index.test.ts | getIpAddress IP masking enabled: should mask IPv6 address when masking is enabled | IPv6 header masked to /48 | PARTIAL | TestMaskIP covers IPv6 masking. Missing: no ClientIP test with an IPv6 header |
| index.test.ts | getIpAddress IP masking enabled: should mask by default when masking is not explicitly disabled | default masks | COVERED | TestClientIP "masks by default"; api TestConsentIPOptions "masked by default" |
| index.test.ts | getIpAddress IP masking enabled: should not mask when masking is explicitly false | masking false returns raw | COVERED | TestClientIP "masking disabled returns full address"; api TestConsentIPOptions "masking disabled stores the full address" |
| index.test.ts | getIpAddress custom headers: should use custom IP headers when provided | custom header list overrides defaults | COVERED | TestClientIP "custom header list" |

Reverse gaps (Go tests with no TS counterpart, not rows above): x-client-ip precedence, blank header skipped, MaskIP idempotence, rate-limit address hashed (api rateaddress_test.go). Default header list and order are identical in ip.go and the TS DEFAULT_IP_HEADERS.

## middleware/auth/validate-api-key.test.ts
Go has no configured key list. Keys are SHA-256 hashed rows looked up in PocketBase (api/auth.go), and core/apikey does the parsing and compare.

| TS file | test name | behaviour asserted (one line) | Go status | Go test or source |
|---|---|---|---|---|
| validate-api-key.test.ts | extractBearerToken: should extract token from valid Bearer header | 'Bearer sk_live_abc123' -> token | COVERED | core/apikey TestParseBearer "bearer" |
| validate-api-key.test.ts | extractBearerToken: should return null for non-Bearer auth | 'Basic abc123' -> null | COVERED | TestParseBearer "wrong scheme"; api TestInitRequiresAuth "wrong scheme" (401) |
| validate-api-key.test.ts | extractBearerToken: should return null for missing Bearer prefix | bare token -> null | MISSING IN GO | Go accepts a bare token that starts c15t_live_ or c15t_test_ (TestParseBearer "bare token" asserts it). Bare non-c15t token returns "" in Go, untested |
| validate-api-key.test.ts | extractBearerToken: should return null for null header | null -> null | N/A | Go takes a string; empty string covered below |
| validate-api-key.test.ts | extractBearerToken: should return null for empty header | '' -> null | COVERED | TestParseBearer "empty"; api TestInitRequiresAuth "no header" (401) |
| validate-api-key.test.ts | extractBearerToken: should handle extra spaces | 'Bearer  abc123' (two spaces) -> null | MISSING IN GO | Go trims and accepts it: TestParseBearer "extra whitespace" asserts the opposite. Go scheme match is also case-insensitive (TestParseBearer "lowercase scheme"), TS is case-sensitive |
| validate-api-key.test.ts | validateApiKey: should return true for valid key | listed keys accepted | COVERED | core/apikey TestVerify (matching secret accepted); api TestInitResolvesPolicy (valid key reaches 200) |
| validate-api-key.test.ts | validateApiKey: should return false for invalid key | unlisted key rejected | COVERED | TestVerify (wrong secret rejected); api TestInitRequiresAuth "bogus key" (401) |
| validate-api-key.test.ts | validateApiKey: should return false for null token | null token rejected | COVERED | TestVerify "Verify accepted an empty secret" check |
| validate-api-key.test.ts | validateApiKey: should return false for undefined keys | no key list -> false | N/A | No configured list in Go, keys are DB rows |
| validate-api-key.test.ts | validateApiKey: should return false for empty keys array | empty list -> false | N/A | No configured list in Go. Closest: api TestInitRejectsRevokedKey and TestInitRequiresAuth "bogus key" |
| validate-api-key.test.ts | validateApiKey: should be case-sensitive | uppercase variant of a key rejected | NOT COVERED | Hash comparison is exact so behaviour holds by construction (core/apikey Verify), no test uppercases a key |
| validate-api-key.test.ts | validateRequestAuth: should return true for valid Authorization header | header with valid key accepted | COVERED | api TestInitResolvesPolicy (auth(key) headers return 200) |
| validate-api-key.test.ts | validateRequestAuth: should return false for invalid token | header with bad key rejected | COVERED | api TestInitRequiresAuth "bogus key" |
| validate-api-key.test.ts | validateRequestAuth: should return false for missing Authorization header | no header rejected | COVERED | api TestInitRequiresAuth "no header" |
| validate-api-key.test.ts | validateRequestAuth: should return false for undefined headers | undefined headers rejected | N/A | HTTP requests always carry a header map in Go |

Reverse gaps (Go behaviour with tests, no TS counterpart): key scope (publishable vs secret), revoked keys, unscoped keys rejected (api TestUnscopedKeyIsRejected, TestInitRejectsRevokedKey, TestPublishable*, TestSecretKeyReachesEverything).

## edge/resolve-consent.test.ts
edge/ is out of scope. Go notes name the nearest init-endpoint test where one exists; none of them asserts the edge return shape (defaults, showBanner, model on the result), which Go's init response does not carry.

| TS file | test name | behaviour asserted (one line) | Go status | Go test or source |
|---|---|---|---|---|
| resolve-consent.test.ts | is synchronous | returns a value, not a Promise | N/A | edge library out of scope |
| resolve-consent.test.ts | resolves opt-in defaults for EU visitor | DE -> GDPR, opt-in, eu_gdpr, banner, defaults map | N/A | edge out of scope. Init analogue: api TestInitResolvesPolicy "germany" (jurisdiction, policy, model) |
| resolve-consent.test.ts | resolves opt-out defaults for US-CA visitor | US-CA -> CCPA, opt-out, defaults granted | N/A | edge out of scope. Init analogue: TestInitResolvesPolicy "california" |
| resolve-consent.test.ts | resolves no-banner defaults for unmatched visitor with default policy | JP -> model none, default policy, no banner | N/A | edge out of scope. Init analogue: TestInitResolvesPolicy "other us state falls to default" |
| resolve-consent.test.ts | respects GPC signal for opt-out policies | sec-gpc 1 on US-CA denies marketing and measurement | N/A | edge out of scope. Go GPC is applied on consent write: core/consent TestBuildAppliesGPC, api TestConsentGPC |
| resolve-consent.test.ts | ignores GPC for opt-in policies | gpc reported true, opt-in defaults unchanged | N/A | edge out of scope |
| resolve-consent.test.ts | handles preselected categories in opt-in mode | preselectedCategories become granted defaults | N/A | edge out of scope. Policy-level: core/policy TestResolvePreselectedCategories |
| resolve-consent.test.ts | returns no-banner fallback when no policies configured | no packs -> model none, policyId no_banner | N/A | edge out of scope. core/policy TestResolveReturnsNil covers nil decision, no no_banner id |
| resolve-consent.test.ts | returns no-banner fallback for explicit empty policyPacks | empty packs -> model none, no banner | N/A | edge out of scope |
| resolve-consent.test.ts | defaults to GDPR when geo-location is disabled | disableGeoLocation -> GDPR, null location | N/A | edge out of scope. Init analogue: api TestInitGeoDisabledFallsBackToGDPR |
| resolve-consent.test.ts | reports location data | country and region returned | N/A | edge out of scope. Go: core/jurisdiction TestLocationFromHeaders |

## edge/init-handler.test.ts
edge/ is out of scope.

| TS file | test name | behaviour asserted (one line) | Go status | Go test or source |
|---|---|---|---|---|
| init-handler.test.ts | works without a database adapter | edge init returns 200 with GDPR, location, opt-in policy | N/A | edge library out of scope |
| init-handler.test.ts | returns 204 for CORS preflight | OPTIONS gets 204 and allow-methods/headers/origin | N/A | edge out of scope, CORS is PocketBase |
| init-handler.test.ts | sets CORS headers for trusted origin | allow-origin echoed, Vary: Origin | N/A | edge out of scope, CORS is PocketBase |
| init-handler.test.ts | omits CORS headers for untrusted origin | no allow-origin for evil.com | N/A | edge out of scope, CORS is PocketBase |
| init-handler.test.ts | omits CORS headers when no origin header is present | no allow-origin without Origin | N/A | edge out of scope, CORS is PocketBase |
| init-handler.test.ts | returns 500 JSON on internal error | thrown error -> 500, code INTERNAL_SERVER_ERROR, CORS kept | N/A | edge out of scope. API analogue: api errors_internal_test.go TestUnexpectedErrorsDoNotLeak (500 envelope, no leak) |
| init-handler.test.ts | returns no-banner policy for unmatched regions | US -> model none, ui mode none | N/A | edge out of scope. Init analogue: TestInitResolvesPolicy "other us state falls to default" |
| init-handler.test.ts | returns content-type application/json | JSON content type | N/A | edge out of scope |

## utils/telemetry-pii.test.ts
Telemetry deliberately not implemented in Go. Rows are N/A.

| TS file | test name | behaviour asserted (one line) | Go status | Go test or source |
|---|---|---|---|---|
| telemetry-pii.test.ts | withDatabaseSpan attributes pass allowlist | DB span attributes limited to allowlist | N/A | telemetry not implemented in Go |
| telemetry-pii.test.ts | withExternalSpan span name is HTTP METHOD hostname only | external span name has no path | N/A | telemetry not implemented in Go |
| telemetry-pii.test.ts | withExternalSpan strips query params from http.url | query string removed from http.url | N/A | telemetry not implemented in Go |
| telemetry-pii.test.ts | withCacheSpan has no unexpected attributes | cache span attributes within allowlist | N/A | telemetry not implemented in Go |
| telemetry-pii.test.ts | withRequestSpan has no http.path attribute | request span omits path | N/A | telemetry not implemented in Go |
| telemetry-pii.test.ts | createRequestSpan has no http.path attribute | created span omits path | N/A | telemetry not implemented in Go |
| telemetry-pii.test.ts | withDatabaseSpan error does not leak error.message or error.stack | DB span error attributes redacted | N/A | telemetry not implemented in Go |
| telemetry-pii.test.ts | withExternalSpan error does not leak error.message or error.stack | external span error redacted | N/A | telemetry not implemented in Go |
| telemetry-pii.test.ts | withCacheSpan error does not leak error.message or error.stack | cache span error redacted | N/A | telemetry not implemented in Go |
| telemetry-pii.test.ts | withRequestSpan error does not leak error.message or error.stack | request span error redacted | N/A | telemetry not implemented in Go |
| telemetry-pii.test.ts | all span types combined: every attribute key is in allowlist | combined allowlist check | N/A | telemetry not implemented in Go |

## utils/metrics.test.ts
Metrics deliberately not implemented in Go. Rows are N/A.

| TS file | test name | behaviour asserted (one line) | Go status | Go test or source |
|---|---|---|---|---|
| metrics.test.ts | getMetrics: returns null when telemetry is disabled | null when disabled | N/A | metrics not implemented in Go |
| metrics.test.ts | getMetrics: returns C15TMetrics instance when telemetry is enabled | instance when enabled | N/A | metrics not implemented in Go |
| metrics.test.ts | getMetrics: returns same instance on subsequent calls | singleton | N/A | metrics not implemented in Go |
| metrics.test.ts | business metrics: has consentCreated counter | counter exists | N/A | metrics not implemented in Go |
| metrics.test.ts | business metrics: has consentAccepted counter | counter exists | N/A | metrics not implemented in Go |
| metrics.test.ts | business metrics: has consentRejected counter | counter exists | N/A | metrics not implemented in Go |
| metrics.test.ts | business metrics: has subjectCreated counter | counter exists | N/A | metrics not implemented in Go |
| metrics.test.ts | business metrics: has subjectLinked counter | counter exists | N/A | metrics not implemented in Go |
| metrics.test.ts | business metrics: has consentCheckCount counter | counter exists | N/A | metrics not implemented in Go |
| metrics.test.ts | business metrics: has initCount counter | counter exists | N/A | metrics not implemented in Go |
| metrics.test.ts | HTTP metrics: has httpRequestDuration histogram | histogram exists | N/A | metrics not implemented in Go; PocketBase _logs covers requests |
| metrics.test.ts | HTTP metrics: has httpRequestCount counter | counter exists | N/A | metrics not implemented in Go; PocketBase _logs covers requests |
| metrics.test.ts | HTTP metrics: has httpErrorCount counter | counter exists | N/A | metrics not implemented in Go; PocketBase _logs covers requests |
| metrics.test.ts | database metrics: has dbQueryDuration histogram | histogram exists | N/A | metrics not implemented in Go |
| metrics.test.ts | database metrics: has dbQueryCount counter | counter exists | N/A | metrics not implemented in Go |
| metrics.test.ts | database metrics: has dbErrorCount counter | counter exists | N/A | metrics not implemented in Go |
| metrics.test.ts | cache metrics: has cacheHit counter | counter exists | N/A | metrics not implemented in Go |
| metrics.test.ts | cache metrics: has cacheMiss counter | counter exists | N/A | metrics not implemented in Go |
| metrics.test.ts | cache metrics: has cacheLatency histogram | histogram exists | N/A | metrics not implemented in Go |
| metrics.test.ts | GVL metrics: has gvlFetchDuration histogram | histogram exists | N/A | metrics not implemented in Go; GVL/TCF out of scope |
| metrics.test.ts | GVL metrics: has gvlFetchCount counter | counter exists | N/A | metrics not implemented in Go; GVL/TCF out of scope |
| metrics.test.ts | GVL metrics: has gvlFetchError counter | counter exists | N/A | metrics not implemented in Go; GVL/TCF out of scope |
| metrics.test.ts | helper methods: recordConsentCreated adds to counter with attributes | counter add with attributes | N/A | metrics not implemented in Go |
| metrics.test.ts | helper methods: recordHttpRequest records both count and duration | count and duration recorded | N/A | metrics not implemented in Go |
| metrics.test.ts | helper methods: recordHttpRequest records error when status >= 400 | error counter on 4xx/5xx | N/A | metrics not implemented in Go |
| metrics.test.ts | helper methods: recordCacheHit increments cache hit counter | counter increment | N/A | metrics not implemented in Go |
| metrics.test.ts | helper methods: recordCacheMiss increments cache miss counter | counter increment | N/A | metrics not implemented in Go |
| metrics.test.ts | helper methods: recordInit increments init counter with geo attributes | init counter with geo attrs | N/A | metrics not implemented in Go |
| metrics.test.ts | getMetrics cached singleton: returns cached instance without options after initialization | cached instance reuse | N/A | metrics not implemented in Go |
| metrics.test.ts | resetMetrics: clears the metrics instance | reset clears singleton | N/A | metrics not implemented in Go |

## utils/create-telemetry-options.test.ts
Telemetry deliberately not implemented in Go. Rows are N/A.

| TS file | test name | behaviour asserted (one line) | Go status | Go test or source |
|---|---|---|---|---|
| create-telemetry-options.test.ts | createTelemetryOptions: returns disabled by default (opt-in) | enabled false by default | N/A | telemetry not implemented in Go |
| create-telemetry-options.test.ts | createTelemetryOptions: sets enabled when explicitly configured | enabled true when set | N/A | telemetry not implemented in Go |
| create-telemetry-options.test.ts | createTelemetryOptions: includes default attributes with service name and version | default service.name and service.version | N/A | telemetry not implemented in Go |
| create-telemetry-options.test.ts | createTelemetryOptions: merges user-provided default attributes | user attributes merged | N/A | telemetry not implemented in Go |
| create-telemetry-options.test.ts | createTelemetryOptions: preserves user-provided tracer | custom tracer kept | N/A | telemetry not implemented in Go |
| create-telemetry-options.test.ts | isTelemetryEnabled: returns false when no options provided | false without options | N/A | telemetry not implemented in Go |
| create-telemetry-options.test.ts | isTelemetryEnabled: returns false when telemetry is not configured | false when unconfigured | N/A | telemetry not implemented in Go |
| create-telemetry-options.test.ts | isTelemetryEnabled: returns false when enabled is not set | false when enabled unset | N/A | telemetry not implemented in Go |
| create-telemetry-options.test.ts | isTelemetryEnabled: returns true when enabled is true | true when enabled | N/A | telemetry not implemented in Go |
| create-telemetry-options.test.ts | getTracer: returns a tracer even when telemetry is disabled | no-op tracer when disabled | N/A | telemetry not implemented in Go |
| create-telemetry-options.test.ts | getTracer: uses user-provided tracer when available | custom tracer used | N/A | telemetry not implemented in Go |
| create-telemetry-options.test.ts | getMeter: returns a meter even when telemetry is disabled | no-op meter when disabled | N/A | telemetry not implemented in Go |
| create-telemetry-options.test.ts | getMeter: returns meter with expected interface when telemetry is enabled | meter interface when enabled | N/A | telemetry not implemented in Go |
| create-telemetry-options.test.ts | createRequestSpan: returns null when telemetry is disabled | null span when disabled | N/A | telemetry not implemented in Go |
| create-telemetry-options.test.ts | createRequestSpan: creates span when telemetry is enabled | span created when enabled | N/A | telemetry not implemented in Go |
| create-telemetry-options.test.ts | withRequestSpan: executes operation without span when telemetry is disabled | operation runs, no span | N/A | telemetry not implemented in Go |
| create-telemetry-options.test.ts | withRequestSpan: wraps operation in span when telemetry is enabled | operation wrapped in span | N/A | telemetry not implemented in Go |
| create-telemetry-options.test.ts | withRequestSpan: propagates errors from operation | errors rethrown | N/A | telemetry not implemented in Go |
| create-telemetry-options.test.ts | getTraceContext: returns null when no active span | null without span | N/A | telemetry not implemented in Go |
| create-telemetry-options.test.ts | cached telemetry config: isTelemetryEnabled returns false before init | false before init | N/A | telemetry not implemented in Go |
| create-telemetry-options.test.ts | cached telemetry config: isTelemetryEnabled returns cached value after init | cached after init | N/A | telemetry not implemented in Go |
| create-telemetry-options.test.ts | cached telemetry config: getDefaultAttributes returns empty before init | empty before init | N/A | telemetry not implemented in Go |
| create-telemetry-options.test.ts | cached telemetry config: getDefaultAttributes returns cached attributes after init | cached attributes after init | N/A | telemetry not implemented in Go |
| create-telemetry-options.test.ts | cached telemetry config: includes tenantId in default attributes when provided | tenant.id attribute set | N/A | telemetry not implemented in Go |
| create-telemetry-options.test.ts | cached telemetry config: does not include tenant.id when tenantId is undefined | tenant.id absent | N/A | telemetry not implemented in Go |
| create-telemetry-options.test.ts | cached telemetry config: resetTelemetryConfig clears the cache | reset clears cache | N/A | telemetry not implemented in Go |
| create-telemetry-options.test.ts | cached telemetry config: getTracer returns a tracer without explicit options after init | tracer from cache | N/A | telemetry not implemented in Go |
| create-telemetry-options.test.ts | cached telemetry config: getMeter returns a meter without explicit options after init | meter from cache | N/A | telemetry not implemented in Go |

## utils/instrumentation.test.ts
Telemetry deliberately not implemented in Go. Rows are N/A.

| TS file | test name | behaviour asserted (one line) | Go status | Go test or source |
|---|---|---|---|---|
| instrumentation.test.ts | withDatabaseSpan: returns operation result when telemetry is disabled | passthrough result | N/A | telemetry not implemented in Go |
| instrumentation.test.ts | withDatabaseSpan: returns operation result when telemetry is enabled | passthrough result | N/A | telemetry not implemented in Go |
| instrumentation.test.ts | withDatabaseSpan: propagates errors from operation | errors rethrown | N/A | telemetry not implemented in Go |
| instrumentation.test.ts | withDatabaseSpan: executes operation without span when telemetry is disabled | no span created | N/A | telemetry not implemented in Go |
| instrumentation.test.ts | withExternalSpan: returns operation result when telemetry is disabled | passthrough result | N/A | telemetry not implemented in Go |
| instrumentation.test.ts | withExternalSpan: returns operation result when telemetry is enabled | passthrough result | N/A | telemetry not implemented in Go |
| instrumentation.test.ts | withExternalSpan: propagates errors from operation | errors rethrown | N/A | telemetry not implemented in Go |
| instrumentation.test.ts | withCacheSpan: returns operation result when telemetry is disabled | passthrough result | N/A | telemetry not implemented in Go |
| instrumentation.test.ts | withCacheSpan: returns operation result when telemetry is enabled | passthrough result | N/A | telemetry not implemented in Go |
| instrumentation.test.ts | withCacheSpan: returns null for cache miss | null result passes through | N/A | telemetry not implemented in Go |
| instrumentation.test.ts | withCacheSpan: propagates errors from operation | errors rethrown | N/A | telemetry not implemented in Go |

## routes/openapi.test.ts

| TS file | test name | behaviour asserted (one line) | Go status | Go test or source |
|---|---|---|---|---|
| openapi.test.ts | OpenAPI route documentation: documents consent and subject request parameters and bodies | generated OpenAPI 3.1 spec has descriptions, required flags and body schemas for subjects, consents/check and legal-documents routes | MISSING IN GO | No openapi/swagger code or spec anywhere in the repo (grep -ril openapi over /Users/thommorais/shed/journ/c15t excluding node_modules and .git returned nothing). Not listed as out of scope |

## init.test.ts

| TS file | test name | behaviour asserted (one line) | Go status | Go test or source |
|---|---|---|---|---|
| init.test.ts | init: uses "c15t" as default appName when none is provided | context.appName defaults to c15t | N/A | Go has no init context or appName. In TS it feeds telemetry defaults and the logger (init.ts lines 39-48) |
| init.test.ts | init: uses the provided appName | custom appName kept | N/A | same as above |
| init.test.ts | init: telemetry is disabled by default (opt-in) | logs "Telemetry is disabled (opt-in required)" | N/A | telemetry not implemented in Go |
| init.test.ts | init: logs telemetry enabled when explicitly enabled | logs telemetry enabled with tracer/meter flags | N/A | telemetry not implemented in Go |
| init.test.ts | init: creates context with required properties | context has appName, logger, db, registry, trustedOrigins | N/A | TS context object has no Go counterpart; Go wiring is api.Register |
| init.test.ts | init: throws when policyPacks use model=iab without top-level iab.enabled | startup throws 'Policies using consent.model="iab" require top-level iab.enabled=true' | PARTIAL | core/policy TestInspectErrors "iab without iab enabled" asserts the message. Missing: Go never validates at startup. policy.Validate runs inside Resolve per request (core/policy/resolve.go), so a bad pack surfaces as a 500 on /init, and api/config.go and main.go do not call it |
| init.test.ts | init: logs policy warnings for non-fatal pack risks | warns "No default policy configured. Requests that do not match region/country will have no active policy." | PARTIAL | core/policy TestInspectWarnings "no default configured" asserts the warning text. Missing: policy.Inspect has no non-test caller (grep over apps/base), so no warning is ever logged |

## Counts
Rows: 197. COVERED 34, PARTIAL 18, NOT COVERED 14, MISSING IN GO 14, N/A 117, UNVERIFIED 0.
