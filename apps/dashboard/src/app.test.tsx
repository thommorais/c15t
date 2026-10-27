import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import type { Client, RecordEvent } from '@thom/pb/client'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { type ConsentRecord, createConsentsLive } from './adapters/pocketbase/consents-live'
import type { Container } from './app/container'
import { anonymous, authenticated, type Session } from './core/domain/session'
import type { AuthPort } from './core/ports/auth'
import { createDashboardRouter } from './router'

const OPERATOR = { id: 'op1', email: 'op@acme.test', tenantId: 'acme' }

const PASSWORD = 'right'

const createFakeAuth = (initial: Session = anonymous): AuthPort => {
	let session = initial
	const listeners = new Set<(session: Session) => void>()
	const set = (next: Session) => {
		session = next
		for (const listener of listeners) listener(session)
	}

	return {
		current: () => session,
		signIn: async ({ password }) => {
			if (password !== PASSWORD) return { ok: false, error: { kind: 'invalid-credentials' } }
			set(authenticated(OPERATOR))
			return { ok: true, operator: OPERATOR }
		},
		signOut: () => set(anonymous),
		subscribe: listener => {
			listeners.add(listener)
			return () => listeners.delete(listener)
		},
	}
}

const consent = (id: string, overrides: Partial<ConsentRecord> = {}): ConsentRecord => ({
	id,
	subject: `sub-${id}`,
	domain: 'd1',
	purposes: [],
	givenAt: '2026-10-14 12:30:00.000Z',
	validUntil: '',
	jurisdiction: 'GDPR',
	consentAction: 'accept_all',
	uiSource: 'banner',
	expand: { domain: { id: 'd1', name: 'shop.example' } },
	...overrides,
})

const createFakeClient = (rows: ConsentRecord[]) => {
	const handlers: ((event: RecordEvent<ConsentRecord>) => void)[] = []

	const client: Client<ConsentRecord> = {
		filter: expr => expr,
		collection: () => ({
			getList: async (page, perPage) => ({ page, perPage, totalItems: rows.length, totalPages: 1, items: [...rows] }),
			subscribe: async (_topic, handler) => {
				handlers.push(handler)
				return async () => {}
			},
		}),
	}

	const create = (record: ConsentRecord) => {
		rows.unshift(record)
		for (const handler of handlers) handler({ action: 'create', record })
	}

	return { client, create }
}

const renderApp = ({ session, rows = [] }: { session?: Session; rows?: ConsentRecord[] } = {}) => {
	const fake = createFakeClient(rows)
	const container: Container = {
		auth: createFakeAuth(session),
		live: { consents: createConsentsLive({ client: fake.client, connection: { onReconnect: () => () => {} } }) },
	}
	const router = createDashboardRouter(container, createMemoryHistory({ initialEntries: ['/'] }))

	render(<RouterProvider router={router} />)

	return { router, create: fake.create }
}

const signIn = (password: string) => {
	fireEvent.change(screen.getByPlaceholderText('Email address'), { target: { value: OPERATOR.email } })
	fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: password } })
	fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
}

afterEach(cleanup)

describe('dashboard', () => {
	it('sends an anonymous visitor to the login page', async () => {
		const { router } = renderApp()

		expect(await screen.findByText('Sign in as an operator')).toBeTruthy()
		expect(router.state.location.pathname).toBe('/login')
	})

	it('says so when the password is wrong', async () => {
		renderApp()
		await screen.findByText('Sign in as an operator')

		signIn('wrong')

		expect(await screen.findByText('Wrong email or password.')).toBeTruthy()
	})

	it('shows the consents once the operator signs in', async () => {
		const { router } = renderApp({ rows: [consent('c1')] })
		await screen.findByText('Sign in as an operator')

		signIn(PASSWORD)

		expect(await screen.findByText('sub-c1')).toBeTruthy()
		expect(screen.getByText('shop.example')).toBeTruthy()
		expect(router.state.location.pathname).toBe('/')
	})

	it('shows an empty state when the tenant has no consents', async () => {
		renderApp({ session: authenticated(OPERATOR) })

		expect(await screen.findByText('No consents yet')).toBeTruthy()
	})

	it('adds a consent to the list when the backend records one', async () => {
		const { create } = renderApp({ session: authenticated(OPERATOR), rows: [consent('c1')] })
		await screen.findByText('sub-c1')

		await act(async () => create(consent('c2')))

		expect(await screen.findByText('sub-c2')).toBeTruthy()
		expect(screen.getAllByRole('row')).toHaveLength(3)
	})

	it('returns to the login page on sign out', async () => {
		const { router } = renderApp({ session: authenticated(OPERATOR) })
		await screen.findByText('No consents yet')

		fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))

		expect(await screen.findByText('Sign in as an operator')).toBeTruthy()
		expect(router.state.location.pathname).toBe('/login')
	})
})
