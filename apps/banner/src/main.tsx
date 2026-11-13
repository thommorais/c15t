import { createGoTransport } from '@c15t/go'
import {
	ConsentBanner,
	ConsentDialog,
	ConsentDialogLink,
	ConsentGate,
	ConsentProvider,
	ConsentTheme,
	custom,
	useSnapshot,
} from '@c15t/react'
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import '@c15t/react/styles.css'
import './style.css'

const params = new URLSearchParams(location.search)
const backendURL = import.meta.env.VITE_C15T_BACKEND_URL ?? 'http://127.0.0.1:8090/api/c15t'
const apiKey = import.meta.env.VITE_C15T_API_KEY
const transport = apiKey ? createGoTransport({ backendURL, apiKey, domain: location.hostname }) : undefined

const Status = () => {
	const snapshot = useSnapshot()
	const [serverRecord, setServerRecord] = useState<unknown>(null)
	const readRecord = async () => {
		try {
			setServerRecord(await transport?.loadSubjectRecord?.(snapshot.subject?.subjectId ?? ''))
		} catch (error) {
			setServerRecord({ error: error instanceof Error ? error.message : 'Cannot read the saved record.' })
		}
	}
	return (
		<section aria-labelledby='state-title'>
			<h2 id='state-title'>Current permissions</h2>
			<dl>
				{Object.entries(snapshot.effectivePermissions).map(([category, allowed]) => (
					<div key={category}>
						<dt>{category}</dt>
						<dd data-allowed={allowed}>{allowed ? 'Allowed' : 'Blocked'}</dd>
					</div>
				))}
			</dl>
			<details>
				<summary>Inspect consent records</summary>
				<pre data-testid='consent-state'>
					{JSON.stringify(
						{
							subjectId: snapshot.subject?.subjectId,
							policy: snapshot.policyRule.id,
							resolution: snapshot.resolution.status,
							permissions: snapshot.effectivePermissions,
							choice: snapshot.explicitChoice,
							prompt: snapshot.promptRequirement.kind,
						},
						null,
						2,
					)}
				</pre>
				<button disabled={!snapshot.subject?.subjectId} onClick={readRecord}>
					Read saved record
				</button>
				<pre data-testid='server-record'>{JSON.stringify(serverRecord, null, 2)}</pre>
			</details>
		</section>
	)
}

const App = () => (
	<ConsentProvider
		options={{
			mode: custom(transport!),
			consentCategories: ['necessary', 'measurement', 'marketing'],
			overrides: {
				country: params.get('country') ?? 'DE',
				...(params.get('region') && { region: params.get('region')! }),
				language: 'en',
				...(params.has('gpc') && { gpc: params.get('gpc') === '1' }),
			},
			styles: false,
			scripts: [{ id: 'demo-measurement', category: 'measurement', src: '/vendor-probe.js' }],
			clearOnRevocation: { measurement: { localStorage: ['demo:measurement'] } },
		}}
	>
		<ConsentTheme />
		<main>
			<header>
				<span className='eyebrow'>c15t / Go + React</span>
				<h1>
					Your choices.
					<br />
					Your control.
				</h1>
				<p>A working consent journey backed by Go. Optional scripts wait until you allow them.</p>
				<ConsentDialogLink className='preferences'>Privacy preferences</ConsentDialogLink>
			</header>
			<div className='panels'>
				<Status />
				<section aria-labelledby='preview-title'>
					<h2 id='preview-title'>Consent in action</h2>
					<p>This preview becomes available when you allow measurement.</p>
					<ConsentGate category='measurement'>
						<div className='preview' data-testid='measurement-content'>
							Measurement is allowed. The local demonstration script can run.
						</div>
					</ConsentGate>
				</section>
			</div>
			<footer>
				Default location: Germany. Use <code>?country=US&amp;region=CA&amp;gpc=1</code> to inspect another policy.
			</footer>
		</main>
		<ConsentBanner />
		<ConsentDialog />
	</ConsentProvider>
)

createRoot(document.getElementById('root')!).render(
	apiKey ? (
		<App />
	) : (
		<main>
			<h1>Connect the Go backend</h1>
			<p>
				Set VITE_C15T_API_KEY to a publishable key, then restart the demo. Setup is documented in the repository README.
			</p>
		</main>
	),
)
