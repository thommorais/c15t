import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));

const valueImports = function valueImports(file: string): string[] {
	return [
		...readFileSync(file, 'utf8').matchAll(
			/^(?:import|export)\s+(?!type\b)[^;]*?from\s+'(?<from>[^']+)'|import\(\s*'(?<dynamic>[^']+)'\s*\)/gmu
		),
	].map((match) => match.groups?.from ?? match.groups?.dynamic ?? '');
};

test('the stored queue imports values only from modules first load does not have', () => {
	expect(valueImports(join(here, '../save-outbox/queue.ts'))).toEqual([
		'../../libs/experiment-record',
	]);
	expect(valueImports(join(here, '../../libs/experiment-record.ts'))).toEqual(
		[]
	);
});
