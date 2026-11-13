import type { Script, ScriptCallbackInfo } from '@c15t/core'

declare global {
	interface Window {
		gtag: (...args: unknown[]) => void
	}
}

const mapping = {
	experience: ['personalization_storage'],
	functionality: ['functionality_storage'],
	marketing: ['ad_storage', 'ad_user_data', 'ad_personalization'],
	measurement: ['analytics_storage'],
	necessary: ['security_storage'],
} as const

// Probe the real loader's effective permissions without depending on an
// integration package outside this React workspace or contacting a vendor.
export const consentModeProbe = (): Script => {
	const signal = (command: 'default' | 'update', info: ScriptCallbackInfo) => {
		const values: Record<string, string> = {}
		for (const [category, names] of Object.entries(mapping)) {
			for (const name of names) {
				values[name] = info.consents[category as keyof typeof mapping] ? 'granted' : 'denied'
			}
		}
		window.gtag('consent', command, values)
	}
	return {
		alwaysLoad: true,
		callbackOnly: true,
		category: 'marketing',
		id: 'consent-mode-probe',
		onBeforeLoad: info => signal('default', info),
		onConsentChange: info => signal('update', info),
	}
}
