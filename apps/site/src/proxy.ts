import { I18nMiddleware } from '_/i18n/i18n-middleware'
import type { NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
	return I18nMiddleware(request)
}

export const config = {
	matcher: ['/((?!api|static|.*\\..*|_next|favicon.ico|robots.txt).*)'],
}
