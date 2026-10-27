export const normalizeRoutePrefix = function normalizeRoutePrefix(
	adapter: string,
	routePrefix: unknown
): string {
	if (typeof routePrefix !== 'string' || !routePrefix.startsWith('/')) {
		throw new TypeError(
			`${adapter}: \`routePrefix\` must be a path that starts with '/', such as '/api/c15t'. Got ${JSON.stringify(routePrefix)}.`
		);
	}
	let end = routePrefix.length;
	while (end > 0 && routePrefix[end - 1] === '/') {
		end -= 1;
	}
	const trimmed = routePrefix.slice(0, end);
	if (trimmed === '') {
		throw new TypeError(
			`${adapter}: \`routePrefix\` can't be '/': a consent route at the site root would catch every page. Use a path such as '/api/c15t'.`
		);
	}
	if (trimmed.startsWith('//')) {
		throw new TypeError(
			`${adapter}: \`routePrefix\` must be a path on this site, such as '/api/c15t'. ${JSON.stringify(routePrefix)} starts with '//', which reads as another host.`
		);
	}
	return trimmed;
};
