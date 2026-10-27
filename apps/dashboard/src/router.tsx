import { createRouter, type RouterHistory } from '@tanstack/react-router'
import type { Container } from './app/container'
import { routeTree } from './routeTree.gen'

const createDashboardRouter = (container: Container, history?: RouterHistory) =>
	createRouter({ routeTree, context: { container }, history })

declare module '@tanstack/react-router' {
	interface Register {
		router: ReturnType<typeof createDashboardRouter>
	}
}

export { createDashboardRouter }
