const SVELTE_SCOPED_CLASS = /\bsvelte-[a-z0-9]+\b/gu;
const S_SCOPED_CLASS = /\bs-[a-z0-9]{6,}\b/gu;
// oxlint-disable-next-line prefer-named-capture-group -- This package supports pre-ES2018 declaration targets.
const CSS_MODULE_CLASS = /^_([^_]+)_[^_]+_\d+$/u;
// oxlint-disable-next-line prefer-named-capture-group -- This package supports pre-ES2018 declaration targets.
const SVELTE_CSS_MODULE_CLASS = /^c15t-ui-(.+)-[A-Za-z0-9]+$/u;
const AUTO_ID_VALUE = /^(?::r[0-9a-z]+:|radix-[a-z0-9-]+|ark-[a-z0-9-]+)$/u;

const STRIP_ATTRS = new Set([
	'data-reactroot',
	'data-reactid',
	'data-svelte-h',
]);

const stripClasses = function stripClasses(classValue: string): string {
	return classValue
		.replace(SVELTE_SCOPED_CLASS, '')
		.replace(S_SCOPED_CLASS, '')
		.split(/\s+/u)
		.filter(Boolean)
		.map(
			(className) =>
				className.match(CSS_MODULE_CLASS)?.[1] ??
				className.match(SVELTE_CSS_MODULE_CLASS)?.[1] ??
				className
		)
		.filter((className, index, classes) => classes.indexOf(className) === index)
		.sort()
		.join(' ');
};

const normalizeAttrValue = function normalizeAttrValue(
	name: string,
	value: string
): string {
	if (
		(name === 'id' ||
			name === 'aria-labelledby' ||
			name === 'aria-describedby' ||
			name === 'aria-controls' ||
			name === 'for') &&
		AUTO_ID_VALUE.test(value)
	) {
		return '__AUTO__';
	}
	if (name === 'class') {
		return stripClasses(value);
	}
	return value;
};

const canonicalize = function canonicalize(el: Element): string {
	const tag = el.tagName.toLowerCase();
	const attrs: string[] = [];

	for (const a of Array.from(el.attributes)) {
		if (STRIP_ATTRS.has(a.name)) {
			continue;
		}
		const normalized = normalizeAttrValue(a.name, a.value);
		if (a.name === 'class' && normalized === '') {
			continue;
		}
		attrs.push(`${a.name}="${normalized}"`);
	}
	attrs.sort();

	const open = `<${tag}${attrs.length ? ` ${attrs.join(' ')}` : ''}>`;

	const children: string[] = [];
	for (const node of Array.from(el.childNodes)) {
		if (node.nodeType === 1) {
			children.push(canonicalize(node as Element));
			continue;
		}
		if (node.nodeType === 3) {
			const text = node.textContent ?? '';
			const trimmed = text.replace(/\s+/gu, ' ').trim();
			if (trimmed) {
				children.push(trimmed);
			}
			continue;
		}
	}

	const close = `</${tag}>`;
	return `${open}${children.join('')}${close}`;
};

export const domSnapshot = function domSnapshot(el: Element): string {
	return canonicalize(el);
};

export const domSnapshotFor = function domSnapshotFor(
	root: ParentNode,
	testIds: readonly string[]
): Record<string, string> {
	const out: Record<string, string> = {};
	for (const id of testIds) {
		const el = root.querySelector(`[data-testid="${id}"]`);
		if (el) {
			out[id] = domSnapshot(el);
		}
	}
	return out;
};
