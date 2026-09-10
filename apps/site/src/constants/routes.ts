/**
 * Application route constants
 * Centralized route definitions to avoid hardcoding paths throughout the application
 */

export const ROUTES = {
	// Root
	home: '/',
	dashboard: '/dashboard',

	// Authentication
	auth: {
		login: '/login',
		welcome: '/welcome',
		recovery: '/recovery',
	},
} as const
