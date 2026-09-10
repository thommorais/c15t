'use client'

import { ROUTES } from '_/constants/routes'
import { createInitialSignupFormState, reduceSignupForm } from '_/features/auth/domain/reducers/signup-form-reducer'
import { validateSignupForm } from '_/features/auth/domain/selectors/auth-rules'
import { useAuth } from '_/features/auth/ui/hooks/use-auth'
import { useRouter } from 'next/navigation'
import { useCallback, useReducer } from 'react'

export type UseSignupFormReturn = {
	// State
	email: string
	password: string
	confirmPassword: string
	name: string
	errors: Record<string, string | undefined>
	isSubmitting: boolean
	submitError: string | null

	// Actions
	setEmail: (email: string) => void
	setPassword: (password: string) => void
	setConfirmPassword: (confirmPassword: string) => void
	setName: (name: string) => void
	handleSubmit: (e: React.FormEvent) => Promise<void>
}

export const useSignupForm = (): UseSignupFormReturn => {
	const router = useRouter()
	const { signUp } = useAuth()
	const [formState, dispatch] = useReducer(reduceSignupForm, createInitialSignupFormState())

	const setEmail = useCallback((email: string) => {
		dispatch({ type: 'EMAIL_CHANGED', email })
	}, [])

	const setPassword = useCallback((password: string) => {
		dispatch({ type: 'PASSWORD_CHANGED', password })
	}, [])

	const setConfirmPassword = useCallback((confirmPassword: string) => {
		dispatch({ type: 'CONFIRM_PASSWORD_CHANGED', confirmPassword })
	}, [])

	const setName = useCallback((name: string) => {
		dispatch({ type: 'NAME_CHANGED', name })
	}, [])

	const handleSubmit = useCallback(
		async (e: React.FormEvent) => {
			e.preventDefault()

			// Validate form
			const errors = validateSignupForm(formState.email, formState.password, formState.confirmPassword, formState.name)

			if (errors) {
				dispatch({ type: 'VALIDATION_FAILED', errors })
				return
			}

			// Submit
			dispatch({ type: 'SUBMIT_STARTED' })

			const result = await signUp({
				email: formState.email,
				password: formState.password,
				name: formState.name,
			})

			if (result.success) {
				dispatch({ type: 'SUBMIT_SUCCEEDED' })
				router.push(ROUTES.dashboard)
			} else {
				dispatch({ type: 'SUBMIT_FAILED', error: result.error.message })
			}
		},
		[formState.email, formState.password, formState.confirmPassword, formState.name, signUp, router],
	)

	return {
		email: formState.email,
		password: formState.password,
		confirmPassword: formState.confirmPassword,
		name: formState.name,
		errors: formState.errors,
		isSubmitting: formState.isSubmitting,
		submitError: formState.submitError,
		setEmail,
		setPassword,
		setConfirmPassword,
		setName,
		handleSubmit,
	}
}
