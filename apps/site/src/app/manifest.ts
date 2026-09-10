import type { MetadataRoute } from 'next'
import { meta } from './meta'

const theme_color = '#DE1A1A'

function manifest(): MetadataRoute.Manifest {
	return {
		name: meta.name,
		short_name: meta.name,
		description: meta.description,
		start_url: '/',
		scope: '/',
		display: 'standalone',
		background_color: theme_color,
		theme_color: theme_color,
		orientation: 'portrait-primary',
		icons: [
			{
				src: '/icons/pwa/icon-72x72.png',
				sizes: '72x72',
				type: 'image/png',
				purpose: 'any',
			},
			{
				src: '/icons/pwa/icon-96x96.png',
				sizes: '96x96',
				type: 'image/png',
				purpose: 'any',
			},
			{
				src: '/icons/pwa/icon-128x128.png',
				sizes: '128x128',
				type: 'image/png',
				purpose: 'any',
			},
			{
				src: '/icons/pwa/icon-144x144.png',
				sizes: '144x144',
				type: 'image/png',
				purpose: 'any',
			},
			{
				src: '/icons/pwa/icon-152x152.png',
				sizes: '152x152',
				type: 'image/png',
				purpose: 'any',
			},
			{
				src: '/icons/pwa/icon-192x192.png',
				sizes: '192x192',
				type: 'image/png',
				purpose: 'any',
			},
			{
				src: '/icons/pwa/icon-384x384.png',
				sizes: '384x384',
				type: 'image/png',
				purpose: 'any',
			},
			{
				src: '/icons/pwa/icon-512x512.png',
				sizes: '512x512',
				type: 'image/png',
				purpose: 'any',
			},
			{
				src: '/icons/maskable_icon.png',
				sizes: '1024x1024',
				type: 'image/png',
				purpose: 'maskable',
			},
			{
				src: '/icons/icon.svg',
				sizes: 'any',
				purpose: 'any',
			},
		],
	}
}

// oxlint-disable-next-line import/no-default-export -- page
export default manifest
