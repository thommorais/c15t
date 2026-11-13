# c15t with Go and React

This workspace ports the c15t backend to Go and PocketBase. The browser engine,
React components, and styles remain TypeScript. `apps/banner` demonstrates the
visitor journey. `apps/dashboard` provides the operator login and live consent list.

Use Node 26 (see `.nvmrc`), pnpm 10.28, Bun for the copied library build scripts,
and Go 1.27 or later.

## Run the visitor demo

1. Install and build the React packages and their dependencies:

   ```sh
   pnpm install --frozen-lockfile
   pnpm --filter '@c15t/react...' --sort run build
   ```

2. Create the database and a publishable key:

   ```sh
   cd apps/base
   go run . migrate up
   go run . apikey:create --name banner --env test --scope publishable --origins http://127.0.0.1:4174
   ```

   Copy the printed key. The demo uses a publishable key. Keep secret API keys on
   the server.

3. Start the backend from `apps/base`. Set a persistent signing secret first:

   ```sh
   export C15T_SNAPSHOT_SECRET='replace-with-a-random-private-signing-secret'
   go run . serve --http=127.0.0.1:8090
   ```

   Setting the secret requires signed policy snapshots on consent writes by default.

4. Copy `apps/banner/.env.example` to `apps/banner/.env.local` and replace its key
   with the publishable key. From the repository root, start the demo:

   ```sh
   pnpm --filter @c15t/banner-demo dev
   ```

   Open `http://127.0.0.1:4174`. The demo starts with Germany's policy. Use
   `?country=US&region=CA&gpc=1` to inspect location and privacy overrides.

5. Reject and reload. Optional scripts should stay blocked. Reopen Privacy
   preferences, enable Analytics, and save. The local vendor script should load.
   Turn Analytics off and save again. The page reloads and removes its stored data.
   Expand Inspect consent records and select Read saved record to compare Go's
   receipts with the browser's choices.

## Use the Go transport

```tsx
import { go } from '@c15t/go'
import { ConsentBanner, ConsentDialog, ConsentProvider } from '@c15t/react'

;<ConsentProvider
	options={{
		mode: go({
			backendURL: 'https://consent.example.com/api/c15t',
			apiKey: publishableKey,
			domain: 'www.example.com',
		}),
		scripts: [{ id: 'analytics', category: 'measurement', src: '/analytics.js' }],
	}}
>
	<App />
	<ConsentBanner />
	<ConsentDialog />
</ConsentProvider>
```

`@c15t/go` wraps the core's `custom()` transport. It uses the Go `/consent` route,
RFC3339 action times, and the current v3 init mapper. Browser subject IDs stay
stable. The adapter keeps PocketBase IDs behind its proof store.

Each browser generates a random 256-bit subject proof before its first save. Go
stores only the hash. The stable client ID and proof make a lost first response
safe to retry. Protected subject writes and first identity links require that
proof. `/subjects/{id}/record` additionally requires it for publishable-key reads.
Normal secret-key subject reads retain their existing permissions.

The adapter stores proofs in localStorage, scoped to the backend URL and site
domain. Key rotation does not discard the proof. If browser storage is unavailable,
proofs last for the current page only. The React persistence module preserves
local choices across reloads. `createGoTransport().loadSubjectRecord(id)` reads
server receipts and supports explicit hydration or the core's identify lifecycle.
Cross-device receipt lookup remains server-only. `/consents/check` still returns
booleans to publishable keys. For SSR, create a
transport and an explicit `proofStore` for each visitor or request.

The current transport supports category choices. It rejects IAB and vendor-level
receipt persistence explicitly. Go also refuses IAB configuration at startup.

## Policies and stored records

`Config.PolicyRules` configures native v3 rules. A nil pointer is unconfigured;
an empty pack is configured with no match. `C15T_POLICY_RULES` accepts the same
JSON rule array, or `null` for unconfigured. Invalid rules stop startup. The default
uses the copied recommended v3 rules plus the Brazil opt-in preset. V3 defaults
include US privacy states and product-defined choice validity for Brazil.

The deprecated `PolicyPacks` field still accepts explicit legacy Go configurations.
New configurations should use `PolicyRules`. The `/init` response contains the v3
`policyResolution` and `x-c15t-policy-contract: 1`. Older `policy` and `policyDecision`
fields remain as compatibility projections for existing Go SDK users.

Signed snapshots carry the resolved rule, fingerprints, location, language, and
GPC input. A later write uses the shown policy even if current rules change.
Consent rows append only the category receipts that an act confirmed. Reading a
subject merges by each category's own confirmation time. A partial save does not
renew untouched categories. Stored choices remain distinct from permissions after
privacy-signal masking.

The additive migration keeps existing rows. Legacy purpose lists prove historical
grants only. They cannot prove explicit denials or invent new confirmation times.
Erasure clears browser identifiers and proof hashes while retaining consent evidence.
The API reference is at `/api/c15t/spec.json`.

## Verification

```sh
cd apps/base
go test ./...
```

From the repository root:

```sh
pnpm --filter @c15t/go typecheck
pnpm --filter @c15t/go test
pnpm --filter @c15t/banner-demo typecheck
pnpm --filter @c15t/banner-demo build
pnpm --filter @c15t/banner-demo test:e2e
```

Install the browser used by the copied React tests and the demo:

```sh
pnpm --filter @c15t/react exec playwright install chromium
```

The transport and demo tests compile an isolated Go API test server, use a temporary
database, and stop the server after the run. Browser tests also start Vite on port
4174, which must be available. These checks require permission to open local sockets.

The copied React tests use Chromium and Istanbul coverage. For a selected lifecycle
run, keep instrumentation enabled and disable whole-package coverage thresholds:

```sh
pnpm --filter @c15t/react exec vitest run \
  src/__tests__/provider-early-init.test.tsx \
  src/__tests__/pending-save.test.tsx \
  src/__tests__/revocation-reload.test.tsx \
  src/__tests__/policy-driver-smoke.test.tsx \
  --coverage.thresholds.lines=0 --coverage.thresholds.functions=0 \
  --coverage.thresholds.statements=0 --coverage.thresholds.branches=0
```

The policy drivers use a local callback-only Consent Mode probe. They exercise the
real script loader's effective permissions without importing an absent upstream
integrations package or requesting a vendor URL.
