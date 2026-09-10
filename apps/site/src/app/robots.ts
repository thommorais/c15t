import { ENVS } from '_/constants'

function robots() {
	return {
		rules: [
			{
				userAgent: '*',
			},
		],
		sitemap: `${ENVS.NEXT_PUBLIC_WEBAPP_URL}/sitemap.xml`,
		host: ENVS.NEXT_PUBLIC_WEBAPP_URL,
	}
}

// oxlint-disable-next-line import/no-default-export -- page
export default robots
