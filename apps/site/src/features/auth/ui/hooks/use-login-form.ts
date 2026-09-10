'use client'

import { ROUTES } from '_/constants/routes'
import { createInitialLoginFormState, reduceLoginForm } from '_/features/auth/domain/reducers/login-form-reducer'
import { validateLoginForm } from '_/features/auth/domain/selectors/auth-rules'
import { useAuth } from '_/features/auth/ui/hooks/use-auth'
import { useRouter } from 'next/navigation'
import { useCallback, useReducer } from 'react'

export type UseLoginFormReturn = {
	// State
	email: string
	password: string
	errors: Record<string, string | undefined>
	isSubmitting: boolean
	submitError: string | null

	// Actions
	setEmail: (email: string) => void
	setPassword: (password: string) => void
	handleSubmit: (e: React.FormEvent) => Promise<void>
}

export const useLoginForm = (): UseLoginFormReturn => {
	const router = useRouter()
	const { signIn } = useAuth()
	const [formState, dispatch] = useReducer(reduceLoginForm, createInitialLoginFormState())

	const setEmail = useCallback((email: string) => {
		dispatch({ type: 'EMAIL_CHANGED', email })
	}, [])

	const setPassword = useCallback((password: string) => {
		dispatch({ type: 'PASSWORD_CHANGED', password })
	}, [])

	const handleSubmit = useCallback(
		async (e: React.FormEvent) => {
			e.preventDefault()

			// Validate form
			const errors = validateLoginForm(formState.email, formState.password)

			if (errors) {
				dispatch({ type: 'VALIDATION_FAILED', errors })
				return
			}

			// Submit
			dispatch({ type: 'SUBMIT_STARTED' })

			const result = await signIn({
				email: formState.email,
				password: formState.password,
			})

			if (result.success) {
				dispatch({ type: 'SUBMIT_SUCCEEDED' })
				router.push(ROUTES.dashboard)
			} else {
				dispatch({ type: 'SUBMIT_FAILED', error: result.error.message })
			}
		},
		[formState.email, formState.password, signIn, router],
	)

	return {
		email: formState.email,
		password: formState.password,
		errors: formState.errors,
		isSubmitting: formState.isSubmitting,
		submitError: formState.submitError,
		setEmail,
		setPassword,
		handleSubmit,
	}
}
