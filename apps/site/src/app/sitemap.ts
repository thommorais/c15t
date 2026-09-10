import { LOCAL_HREFS } from '_/constants'

async function sitemap() {
	return [LOCAL_HREFS].map(route => ({
		url: `${route}`,
		lastModified: new Date().toISOString().split('T')[0],
	}))
}

// oxlint-disable-next-line import/no-default-export -- page
export default sitemap
