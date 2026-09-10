import type { SignupFormEvent, SignupFormState } from '_/features/auth/domain/types'

/**
 * Pure reducer for signup form state transitions
 * @pure
 */
export const reduceSignupForm = (state: SignupFormState, event: SignupFormEvent): SignupFormState => {
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

		case 'CONFIRM_PASSWORD_CHANGED':
			return {
				...state,
				confirmPassword: event.confirmPassword,
				errors: { ...state.errors, confirmPassword: undefined },
			}

		case 'NAME_CHANGED':
			return {
				...state,
				name: event.name,
				errors: { ...state.errors, name: undefined },
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
				confirmPassword: '',
				name: '',
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
 * Creates initial signup form state
 * @pure
 */
export const createInitialSignupFormState = (): SignupFormState => ({
	email: '',
	password: '',
	confirmPassword: '',
	name: '',
	errors: {},
	isSubmitting: false,
	submitError: null,
})
