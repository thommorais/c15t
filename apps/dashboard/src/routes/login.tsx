import { Button } from '@journ/bloom/button'
import { Input } from '@journ/bloom/input'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useSession, useSignIn } from '../app/use-session'
import type { AuthError } from '../core/ports/auth'

const messageFor = (error: AuthError): string => {
	switch (error.kind) {
		case 'invalid-credentials':
			return 'Wrong email or password.'
		case 'network':
			return 'Cannot reach the server.'
		default:
			return error.message
	}
}

const Login = () => {
	const navigate = useNavigate()
	const signIn = useSignIn()
	const session = useSession()
	const [error, setError] = useState<string>()
	const [isSubmitting, setSubmitting] = useState(false)

	useEffect(() => {
		if (session.status === 'authenticated') {
			void navigate({ to: '/', replace: true })
		}
	}, [session.status, navigate])

	const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault()
		const form = new FormData(event.currentTarget)
		setSubmitting(true)
		setError(undefined)

		const result = await signIn({
			email: String(form.get('email') ?? ''),
			password: String(form.get('password') ?? ''),
		})

		if (!result.ok) {
			setError(messageFor(result.error))
		}

		setSubmitting(false)
	}

	return (
		<main className='flex min-h-dvh w-full flex-col items-center justify-center p-8'>
			<div className='w-full max-w-sm space-y-8'>
				<div className='space-y-2 text-center'>
					<h1 className='font-serif text-xl'>c15t</h1>
					<p className='text-dim text-sm'>Sign in as an operator</p>
				</div>

				<form onSubmit={onSubmit} className='flex flex-col space-y-4'>
					<Input
						type='email'
						name='email'
						placeholder='Email address'
						required
						autoComplete='email'
						autoCapitalize='none'
						autoCorrect='off'
						spellCheck={false}
						aria-invalid={error ? true : undefined}
					/>

					<Input
						type='password'
						name='password'
						placeholder='Password'
						required
						autoComplete='current-password'
						aria-invalid={error ? true : undefined}
					/>

					{error && <p className='text-destructive text-sm'>{error}</p>}

					<Button type='submit' pending={isSubmitting} className='h-10 w-full'>
						Continue
					</Button>
				</form>
			</div>
		</main>
	)
}

export const Route = createFileRoute('/login')({
	component: Login,
})
