// Usage: bun dump.mjs <path to @c15t/translations dist/all.js> <output dir>
// Writes one JSON file per bundled language. pt-BR.json and pt-PT.json are
// maintained by hand and are never written or removed here.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [dist, out] = process.argv.slice(2);
if (!dist || !out) {
	console.error('usage: bun dump.mjs <dist/all.js> <output dir>');
	process.exit(1);
}

const { baseTranslations } = await import(dist);
mkdirSync(out, { recursive: true });

const sort = (value) =>
	value && typeof value === 'object' && !Array.isArray(value)
		? Object.fromEntries(
				Object.keys(value)
					.sort()
					.map((key) => [key, sort(value[key])])
			)
		: value;

for (const [language, translations] of Object.entries(baseTranslations)) {
	writeFileSync(
		join(out, `${language}.json`),
		`${JSON.stringify(sort(translations), null, '\t')}\n`
	);
}

console.log(`wrote ${Object.keys(baseTranslations).length} languages to ${out}`);
