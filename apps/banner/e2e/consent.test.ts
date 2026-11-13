import { afterAll, beforeAll, expect, test } from 'vitest'
import { chromium } from 'playwright'
import type { Browser, Page } from 'playwright'
import { createServer } from 'vite'
import type { ViteDevServer } from 'vite'
import { startGoServer } from '../../../scripts/go-test-server.mjs'

let goServer: Awaited<ReturnType<typeof startGoServer>>
let vite: ViteDevServer
let browser: Browser
const origin = 'http://127.0.0.1:4174'

beforeAll(async () => {
	goServer = await startGoServer(origin)
	vite = await createServer({
		root: new URL('../', import.meta.url).pathname,
		configFile: new URL('../vite.config.ts', import.meta.url).pathname,
		define: {
			'import.meta.env.VITE_C15T_API_KEY': JSON.stringify(goServer.apiKey),
			'import.meta.env.VITE_C15T_BACKEND_URL': JSON.stringify(goServer.backendURL),
		},
		server: { host: '127.0.0.1', port: 4174, strictPort: true },
	})
	await vite.listen()
	browser = await chromium.launch({ headless: true })
})
afterAll(async () => {
	await browser?.close()
	await vite?.close()
	await goServer?.close()
})

const state = async (page: Page) => JSON.parse((await page.getByTestId('consent-state').textContent()) ?? '{}')
const waitPermission = async (page: Page, category: string, value: boolean) => {
	await page.waitForFunction(
		({ category, value }) =>
			JSON.parse(document.querySelector('[data-testid="consent-state"]')?.textContent ?? '{}').permissions?.[
				category
			] === value,
		{ category, value },
	)
}

test('reject, reload, reopen, partial grant, server hydration, and revocation', async () => {
	const context = await browser.newContext()
	const page = await context.newPage()
	const errors: string[] = []
	page.on('pageerror', error => errors.push(error.message))
	let vendorRequests = 0
	page.on('request', request => {
		if (request.url().endsWith('/vendor-probe.js')) vendorRequests++
	})
	await page.goto(origin)
	await page.getByTestId('consent-banner-reject-button').waitFor()
	expect(vendorRequests).toBe(0)
	const rejected = page.waitForResponse(r => r.url().endsWith('/consent') && r.request().method() === 'POST')
	await page.getByTestId('consent-banner-reject-button').click()
	expect((await rejected).status()).toBe(201)
	await page.reload()
	await waitPermission(page, 'measurement', false)
	expect((await state(page)).prompt).toBe('none')
	expect(vendorRequests).toBe(0)
	await page.getByRole('button', { name: 'Privacy preferences', exact: true }).click()
	const dialog = page.getByRole('dialog')
	await dialog.waitFor()
	const measurement = dialog.getByRole('switch', { name: /Analytics|measurement/i })
	await measurement.click()
	const saved = page.waitForResponse(r => r.url().endsWith('/consent') && r.request().method() === 'POST')
	await dialog.getByRole('button', { name: /Save Settings/i }).click()
	expect((await saved).ok()).toBe(true)
	await waitPermission(page, 'measurement', true)
	await page.waitForFunction(() => localStorage.getItem('demo:measurement') === 'loaded')
	expect(vendorRequests).toBe(1)
	const before = await state(page)
	expect(before.choice.categories.marketing.value).toBe(false)
	// Reload with the existing subject. Server hydration must not renew
	// either category's confirmation time.
	await page.reload()
	await waitPermission(page, 'measurement', true)
	const reloaded = await state(page)
	expect(reloaded.choice.categories.measurement.confirmedAt).toBe(before.choice.categories.measurement.confirmedAt)
	expect(reloaded.choice.categories.marketing.confirmedAt).toBe(before.choice.categories.marketing.confirmedAt)
	await page.getByText('Inspect consent records', { exact: true }).click()
	await page.getByRole('button', { name: 'Read saved record' }).click()
	await page.waitForFunction(
		() =>
			JSON.parse(document.querySelector('[data-testid="server-record"]')?.textContent ?? 'null')?.choice?.categories
				?.measurement !== undefined,
	)
	const serverRecord = JSON.parse((await page.getByTestId('server-record').textContent()) ?? '{}')
	expect(serverRecord.choice.categories.measurement).toEqual(before.choice.categories.measurement)
	expect(serverRecord.choice.categories.marketing).toEqual(before.choice.categories.marketing)
	await page.getByRole('button', { name: 'Privacy preferences', exact: true }).click()
	await page
		.getByRole('dialog')
		.getByRole('switch', { name: /Analytics|measurement/i })
		.click()
	const navigation = page.waitForEvent('load')
	await page
		.getByRole('dialog')
		.getByRole('button', { name: /Save Settings/i })
		.click()
	await navigation
	await waitPermission(page, 'measurement', false)
	expect(await page.evaluate(() => localStorage.getItem('demo:measurement'))).toBeNull()
	expect(errors).toEqual([])
	await page.screenshot({ path: '/private/tmp/c15t-banner-demo.png', fullPage: true })
	await context.close()
})

test('React overrides select the California policy and preserve explicit GPC false', async () => {
	const context = await browser.newContext()
	const page = await context.newPage()
	await page.goto(`${origin}/?country=US&region=CA&gpc=0`)
	await page.waitForFunction(
		() =>
			JSON.parse(document.querySelector('[data-testid="consent-state"]')?.textContent ?? '{}').policy ===
			'us_privacy_states_opt_out',
	)
	await waitPermission(page, 'measurement', true)
	await context.close()
})

test('GPC restricts tracking under the opt-out policy', async () => {
	const context = await browser.newContext()
	const page = await context.newPage()
	let vendorRequests = 0
	page.on('request', request => {
		if (request.url().endsWith('/vendor-probe.js')) vendorRequests++
	})
	await page.goto(`${origin}/?country=US&region=CA&gpc=1`)
	await page.waitForFunction(
		() =>
			JSON.parse(document.querySelector('[data-testid="consent-state"]')?.textContent ?? '{}').policy ===
			'us_privacy_states_opt_out',
	)
	await waitPermission(page, 'measurement', false)
	await waitPermission(page, 'marketing', false)
	expect(vendorRequests).toBe(0)
	await context.close()
})

test('a changed policy prompts again and blocks grants made under the old policy', async () => {
	const context = await browser.newContext()
	const page = await context.newPage()
	await page.goto(origin)
	const saved = page.waitForResponse(r => r.url().endsWith('/consent') && r.request().method() === 'POST')
	await page.getByTestId('consent-banner-accept-button').click()
	expect((await saved).ok()).toBe(true)
	await waitPermission(page, 'measurement', true)
	await goServer.changePolicy('new-policy-copy')
	await page.reload()
	await page.getByTestId('consent-banner-reject-button').waitFor()
	await waitPermission(page, 'measurement', false)
	expect((await state(page)).prompt).toBe('choice')
	await context.close()
})
