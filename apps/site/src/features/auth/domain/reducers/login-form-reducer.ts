import type { LoginFormEvent, LoginFormState } from '_/features/auth/domain/types'

/**
 * Pure reducer for login form state transitions
 * @pure
 */
export const reduceLoginForm = (state: LoginFormState, event: LoginFormEvent): LoginFormState => {
	switch (event.type) {
		case 'EMAIL_CHANGED':
			return {
				...state,
				email: event.email,
				errors: { ...state.errors, email: undefined },
			}

		case 'PASSWORD_CHANGED':
			return {
				...state,
				password: event.password,
				errors: { ...state.errors, password: undefined },
			}

		case 'VALIDATION_FAILED':
			return {
				...state,
				errors: event.errors,
			}

		case 'SUBMIT_STARTED':
			return {
				...state,
				isSubmitting: true,
				submitError: null,
			}

		case 'SUBMIT_SUCCEEDED':
			return {
				email: '',
				password: '',
				errors: {},
				isSubmitting: false,
				submitError: null,
			}

		case 'SUBMIT_FAILED':
			return {
				...state,
				isSubmitting: false,
				submitError: event.error,
			}

		default: {
			const _exhaustive: never = event
			return state
		}
	}
}

/**
 * Creates initial login form state
 * @pure
 */
export const createInitialLoginFormState = (): LoginFormState => ({
	email: '',
	password: '',
	errors: {},
	isSubmitting: false,
	submitError: null,
})
