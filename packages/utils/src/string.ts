const upperCaseFirstLetter = (str: string) => str.charAt(0).toUpperCase() + str.slice(1)

/**
 * Builds a URL-safe slug. Latin accents are folded (`São` yields `sao`), but
 * characters with no ASCII decomposition (Cyrillic, CJK) are dropped, so
 * non-Latin input can slug to an empty string.
 */
const slugify = (text: string) =>
	text
		.toString()
		.normalize('NFD')
		.toLowerCase()
		.trim()
		.replace(/\s+/g, '-')
		.replace(/[^\w-]+/g, '')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '')

export { slugify, upperCaseFirstLetter }
