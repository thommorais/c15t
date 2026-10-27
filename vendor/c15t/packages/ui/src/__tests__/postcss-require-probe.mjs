import { createRequire } from 'node:module';

const requireFromProbe = createRequire(import.meta.url);
const postcss = requireFromProbe('postcss');
const pluginNamespace = requireFromProbe('@c15t/ui/postcss-tailwind3');

const [, , css, from] = process.argv;
const result = await postcss([pluginNamespace]).process(css, { from });
process.stdout.write(JSON.stringify({ css: result.css }));
