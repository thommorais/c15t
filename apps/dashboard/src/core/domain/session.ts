type Operator = {
	readonly id: string
	readonly email: string
	readonly tenantId: string
}

type Session = { readonly status: 'anonymous' } | { readonly status: 'authenticated'; readonly operator: Operator }

const anonymous: Session = { status: 'anonymous' }

const authenticated = (operator: Operator): Session => ({ status: 'authenticated', operator })

export { anonymous, authenticated }
export type { Operator, Session }
