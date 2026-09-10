import { getStaticParams } from '_/i18n/config-server'
import '_/styles/globals.css'
import '_/styles/tailwind.css'
import type { Metadata } from 'next'
import { meta } from './meta'

export function generateStaticParams() {
	return getStaticParams()
}

export const metadata: Metadata = {
	title: meta.name,
	description: meta.description,
	manifest: '/manifest.json',
	appleWebApp: {
		capable: true,
		statusBarStyle: 'default',
		title: meta.name,
	},
	formatDetection: {
		telephone: false,
	},
	icons: {
		icon: [
			{ url: '/icons/icon.svg', type: 'image/svg+xml' },
			{ url: '/icons/pwa/icon-192x192.png', sizes: '192x192', type: 'image/png' },
		],
		apple: [
			{ url: '/icons/pwa/icon-152x152.png', sizes: '152x152', type: 'image/png' },
			{ url: '/icons/pwa/icon-192x192.png', sizes: '192x192', type: 'image/png' },
		],
	},
	viewport: {
		width: 'device-width',
		initialScale: 1,
		maximumScale: 1,
		userScalable: false,
		viewportFit: 'cover',
	},
}

type RootLayoutProps = {
	children: React.ReactNode
}

const RootLayout = async ({ children }: RootLayoutProps): Promise<React.ReactNode> => children

// oxlint-disable-next-line import/no-default-export -- layout
export default RootLayout
