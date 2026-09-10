import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
	/* config options here */
	/** Enables hot reloading for local packages without a build step */
	transpilePackages: ['@thom/ui'],
	async headers() {
		return [
			{
				source: '/(.*)',
				headers: [
					{
						key: 'X-Content-Type-Options',
						value: 'nosniff',
					},
					{
						key: 'X-Frame-Options',
						value: 'DENY',
					},
					{
						key: 'Referrer-Policy',
						value: 'strict-origin-when-cross-origin',
					},
				],
			},
		]
	},
}
// oxlint-disable-next-line import/no-default-export -- nextConfig
export default nextConfig
