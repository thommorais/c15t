'use client'

import { Button } from '@thom/ui/button'
import { Input } from '@thom/ui/input'
import { useSignupForm } from '_/features/auth/ui/hooks/use-signup-form'
import { authFormStyles, styles } from './auth-form-styles'

export const SignupForm = () => {
	const {
		email,
		password,
		confirmPassword,
		name,
		errors,
		isSubmitting,
		submitError,
		setEmail,
		setPassword,
		setConfirmPassword,
		setName,
		handleSubmit,
	} = useSignupForm()

	const nameId = 'name'
	const emailId = 'email'
	const passwordId = 'password'
	const confirmPasswordId = 'confirmPassword'

	return (
		<form onSubmit={handleSubmit} className={styles.form()}>
			{/* Name Field */}
			<div className={styles.field()}>
				<label htmlFor={nameId} className={styles.label()}>
					Name
					<span className={styles.required()}>*</span>
				</label>
				<Input
					type='text'
					id={nameId}
					value={name}
					onChange={e => setName(e.target.value)}
					disabled={isSubmitting}
					className={authFormStyles({ hasError: !!errors.name }).input()}
					placeholder='Enter your name'
					autoComplete='name'
					required
				/>
				{errors.name && <p className={styles.error()}>{errors.name}</p>}
			</div>

			{/* Email Field */}
			<div className={styles.field()}>
				<label htmlFor={emailId} className={styles.label()}>
					Email
					<span className={styles.required()}>*</span>
				</label>
				<Input
					type='email'
					id={emailId}
					value={email}
					onChange={e => setEmail(e.target.value)}
					disabled={isSubmitting}
					className={authFormStyles({ hasError: !!errors.email }).input()}
					placeholder='Enter your email'
					autoComplete='email'
					required
				/>
				{errors.email && <p className={styles.error()}>{errors.email}</p>}
			</div>

			{/* Password Field */}
			<div className={styles.field()}>
				<label htmlFor={passwordId} className={styles.label()}>
					Password
					<span className={styles.required()}>*</span>
				</label>
				<Input
					type='password'
					id={passwordId}
					value={password}
					onChange={e => setPassword(e.target.value)}
					disabled={isSubmitting}
					className={authFormStyles({ hasError: !!errors.password }).input()}
					placeholder='Enter your password'
					autoComplete='new-password'
					required
				/>
				{errors.password && <p className={styles.error()}>{errors.password}</p>}
			</div>

			{/* Confirm Password Field */}
			<div className={styles.field()}>
				<label htmlFor={confirmPasswordId} className={styles.label()}>
					Confirm Password
					<span className={styles.required()}>*</span>
				</label>
				<Input
					type='password'
					id={confirmPasswordId}
					value={confirmPassword}
					onChange={e => setConfirmPassword(e.target.value)}
					disabled={isSubmitting}
					className={authFormStyles({ hasError: !!errors.confirmPassword }).input()}
					placeholder='Confirm your password'
					autoComplete='new-password'
					required
				/>
				{errors.confirmPassword && <p className={styles.error()}>{errors.confirmPassword}</p>}
			</div>

			{/* Submit Error */}
			{submitError && (
				<div className={styles.submitError()}>
					<p className={styles.submitErrorText()}>{submitError}</p>
				</div>
			)}

			{/* Submit Button */}
			<Button type='submit' disabled={isSubmitting} className={styles.button()}>
				{isSubmitting ? 'Creating account...' : 'Create Account'}
			</Button>
		</form>
	)
}
