'use client'

import { Button } from '@thom/ui/button'
import { Input } from '@thom/ui/input'
import { useLoginForm } from '_/features/auth/ui/hooks/use-login-form'
import { authFormStyles, styles } from './auth-form-styles'

export const LoginForm = () => {
	const { email, password, errors, isSubmitting, submitError, setEmail, setPassword, handleSubmit } = useLoginForm()

	const emailId = 'email'
	const passwordId = 'password'

	return (
		<form onSubmit={handleSubmit} className={styles.form()}>
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
					autoComplete='current-password'
					required
				/>
				{errors.password && <p className={styles.error()}>{errors.password}</p>}
			</div>

			{/* Submit Error */}
			{submitError && (
				<div className={styles.submitError()}>
					<p className={styles.submitErrorText()}>{submitError}</p>
				</div>
			)}

			{/* Submit Button */}
			<Button type='submit' disabled={isSubmitting} className={styles.button()}>
				{isSubmitting ? 'Signing in...' : 'Sign In'}
			</Button>
		</form>
	)
}
