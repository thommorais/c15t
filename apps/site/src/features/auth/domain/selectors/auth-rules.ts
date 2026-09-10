import { MIN_PASSWORD_LENGTH } from '_/features/auth/domain/constants'
import type { LoginFormErrors, SignupFormErrors } from '_/features/auth/domain/types'
import type { LocaleKey } from '_/i18n/dictionaries/types'

/**
 * Validates email format using simple regex
 * @pure
 */
export const isValidEmail = (value: string): boolean => {
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
	return emailRegex.test(value)
}

/**
 * Validates password meets minimum requirements
 * @pure
 */
export const isValidPassword = (value: string): boolean => {
	return value.length >= MIN_PASSWORD_LENGTH
}

/**
 * Validates email field
 * Returns error locale key or undefined if valid
 * @pure
 */
export const validateEmail = (email: string): LocaleKey | undefined => {
	const trimmed = email.trim()

	if (!trimmed) {
		return 'auth.validation.emailRequired' as LocaleKey
	}

	if (!isValidEmail(trimmed)) {
		return 'auth.validation.emailInvalid' as LocaleKey
	}

	return undefined
}

/**
 * Validates password field
 * Returns error locale key or undefined if valid
 * @pure
 */
export const validatePassword = (password: string): LocaleKey | undefined => {
	if (!password) {
		return 'auth.validation.passwordRequired' as LocaleKey
	}

	if (!isValidPassword(password)) {
		return 'auth.validation.passwordTooShort' as LocaleKey
	}

	return undefined
}

/**
 * Validates login form fields
 * Returns errors object or null if valid
 * @pure
 */
export const validateLoginForm = (email: string, password: string): LoginFormErrors | null => {
	const emailError = validateEmail(email)
	const passwordError = validatePassword(password)

	if (emailError || passwordError) {
		return {
			...(emailError && { email: emailError }),
			...(passwordError && { password: passwordError }),
		}
	}

	return null
}

/**
 * Checks if errors object has any errors
 * @pure
 */
export const hasErrors = (errors: LoginFormErrors): boolean => {
	return Object.keys(errors).length > 0
}

/**
 * Validates name field
 * Returns error locale key or undefined if valid
 * @pure
 */
export const validateName = (name: string): LocaleKey | undefined => {
	const trimmed = name.trim()

	if (!trimmed) {
		return 'auth.validation.nameRequired' as LocaleKey
	}

	if (trimmed.length < 2) {
		return 'auth.validation.nameTooShort' as LocaleKey
	}

	return undefined
}

/**
 * Validates password confirmation matches password
 * Returns error locale key or undefined if valid
 * @pure
 */
export const validateConfirmPassword = (password: string, confirmPassword: string): LocaleKey | undefined => {
	if (!confirmPassword) {
		return 'auth.validation.confirmPasswordRequired' as LocaleKey
	}

	if (password !== confirmPassword) {
		return 'auth.validation.passwordsDoNotMatch' as LocaleKey
	}

	return undefined
}

/**
 * Validates signup form fields
 * Returns errors object or null if valid
 * @pure
 */
export const validateSignupForm = (
	email: string,
	password: string,
	confirmPassword: string,
	name: string,
): SignupFormErrors | null => {
	const emailError = validateEmail(email)
	const passwordError = validatePassword(password)
	const confirmPasswordError = validateConfirmPassword(password, confirmPassword)
	const nameError = validateName(name)

	if (emailError || passwordError || confirmPasswordError || nameError) {
		return {
			...(emailError && { email: emailError }),
			...(passwordError && { password: passwordError }),
			...(confirmPasswordError && { confirmPassword: confirmPasswordError }),
			...(nameError && { name: nameError }),
		}
	}

	return null
}
