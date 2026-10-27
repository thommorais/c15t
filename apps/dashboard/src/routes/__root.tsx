import { Button } from '@journ/bloom/button'
import { createRootRouteWithContext, type ErrorComponentProps, Outlet, useRouter } from '@tanstack/react-router'
import { ContainerProvider } from '../app/container'
import type { RouterContext } from '../routing'

const RootComponent = () => {
	const { container } = Route.useRouteContext()

	return (
		<ContainerProvider container={container}>
			<Outlet />
		</ContainerProvider>
	)
}

const ErrorComponent = ({ error }: ErrorComponentProps) => {
	const router = useRouter()

	return (
		<main className='flex min-h-dvh w-full flex-col items-center justify-center gap-6 p-8'>
			<div className='max-w-md space-y-2 text-center'>
				<h1 className='font-serif text-lg'>Something went wrong</h1>
				<p className='text-dim text-sm'>{error instanceof Error ? error.message : 'Unknown error'}</p>
			</div>

			<Button tone='outline' onClick={() => router.invalidate()}>
				Try again
			</Button>
		</main>
	)
}

export const Route = createRootRouteWithContext<RouterContext>()({
	component: RootComponent,
	errorComponent: ErrorComponent,
})
