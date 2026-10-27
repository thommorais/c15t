const RTL_LANGUAGES = new Set([
	'ar',
	'ckb',
	'dv',
	'fa',
	'he',
	'iw',
	'ji',
	'nqo',
	'ps',
	'sd',
	'syr',
	'ug',
	'ur',
	'yi',
]);

const RTL_SCRIPTS = new Set([
	'adlm',
	'arab',
	'aran',
	'armi',
	'avst',
	'chrs',
	'cprt',
	'elym',
	'gara',
	'hatr',
	'hebr',
	'hung',
	'khar',
	'lydi',
	'mand',
	'mani',
	'mend',
	'merc',
	'mero',
	'narb',
	'nbat',
	'nkoo',
	'orkh',
	'ougr',
	'palm',
	'phli',
	'phlp',
	'phlv',
	'phnx',
	'prti',
	'rohg',
	'samr',
	'sarb',
	'sidt',
	'sogd',
	'sogo',
	'syrc',
	'syre',
	'syrj',
	'syrn',
	'thaa',
	'yezi',
]);

let lastFocusedElement: HTMLElement | null = null;

if (typeof document !== 'undefined') {
	document.addEventListener(
		'focusin',
		(event) => {
			if (
				event.target instanceof HTMLElement &&
				event.target !== document.body &&
				event.target !== document.documentElement
			) {
				lastFocusedElement = event.target;
			}
		},
		true
	);
}

export const getTextDirection = function getTextDirection(
	language?: string
): 'rtl' | 'ltr' {
	if (!language) {
		return 'ltr';
	}
	const parts = language.toLowerCase().split('-');
	const extensionStart = parts.findIndex((part) => part.length === 1);
	const [primary = '', ...subtags] =
		extensionStart === -1 ? parts : parts.slice(0, extensionStart);
	const script = subtags.find((subtag) => /^[a-z]{4}$/u.test(subtag));
	if (script) {
		return RTL_SCRIPTS.has(script) ? 'rtl' : 'ltr';
	}
	return RTL_LANGUAGES.has(primary) ? 'rtl' : 'ltr';
};

export const setupTextDirection = function setupTextDirection(
	language?: string
) {
	const direction = getTextDirection(language);
	if (direction === 'rtl') {
		document.body.classList.add('c15t-rtl');
	} else {
		document.body.classList.remove('c15t-rtl');
	}

	return () => {
		document.body.classList.remove('c15t-rtl');
	};
};

export const getFocusableElements = function getFocusableElements(
	container: HTMLElement
): HTMLElement[] {
	const selector = [
		'a[href]:not([disabled]):not([tabindex="-1"])',
		'button:not([disabled]):not([tabindex="-1"])',
		'textarea:not([disabled]):not([tabindex="-1"])',
		'input:not([disabled]):not([tabindex="-1"])',
		'select:not([disabled]):not([tabindex="-1"])',
		'[contenteditable]:not([tabindex="-1"])',
		'summary:not([tabindex="-1"])',
		'audio[controls]:not([tabindex="-1"])',
		'video[controls]:not([tabindex="-1"])',
		'[tabindex]:not([tabindex="-1"])',
	].join(',');

	return Array.from(container.querySelectorAll<HTMLElement>(selector)).filter(
		(el) => {
			if (el.tabIndex < 0) {
				return false;
			}
			if (typeof el.checkVisibility === 'function') {
				return el.checkVisibility({ checkVisibilityCSS: true });
			}
			if (el.getClientRects().length > 0) {
				return true;
			}
			const environmentHasLayout =
				document.documentElement.getClientRects().length > 0;
			if (environmentHasLayout) {
				return false;
			}
			for (let node: HTMLElement | null = el; node; node = node.parentElement) {
				if (node.hidden || node.style.display === 'none') {
					return false;
				}
			}
			return true;
		}
	);
};

let scrollLockCount = 0;
let scrollLockRestore: (() => void) | null = null;

const hasVisibleOverflow = (style: CSSStyleDeclaration): boolean =>
	[style.overflowX, style.overflowY].every(
		(value) => value === '' || value === 'visible'
	);

const supportsScrollbarGutter = (): boolean =>
	typeof CSS !== 'undefined' &&
	typeof CSS.supports === 'function' &&
	CSS.supports('scrollbar-gutter', 'stable');

const toCSSPixels = (element: HTMLElement, width: number): number =>
	width / (element.currentCSSZoom || 1);

export const setupScrollLock = function setupScrollLock() {
	if (scrollLockCount === 0) {
		const root = document.documentElement;
		const { body } = document;
		const rootStyle = window.getComputedStyle(root);
		const scrollbarWidth = window.innerWidth - root.clientWidth;
		const rootWidth = root.getBoundingClientRect().width;
		const restores: (() => void)[] = [];
		const setStyle = (
			element: HTMLElement,
			property: string,
			value: string,
			related: string[] = []
		) => {
			const saved = [property, ...related].map((name) => ({
				name,
				priority: element.style.getPropertyPriority(name),
				value: element.style.getPropertyValue(name),
			}));
			element.style.setProperty(property, value);
			restores.push(() => {
				for (const { name } of saved) {
					element.style.removeProperty(name);
				}
				for (const { name, priority, value: previous } of saved) {
					if (previous) {
						element.style.setProperty(name, previous, priority);
					}
				}
			});
		};
		const hideOverflow = (element: HTMLElement) => {
			setStyle(element, 'overflow', 'hidden', ['overflow-x', 'overflow-y']);
		};
		const fillGap = (gap: number) => {
			const width = `${toCSSPixels(body, gap)}px`;
			setStyle(body, 'padding-right', width);
			setStyle(root, '--c15t-scroll-lock-gap', width);
		};

		if (hasVisibleOverflow(rootStyle)) {
			hideOverflow(body);
		} else {
			hideOverflow(root);
			if (!hasVisibleOverflow(window.getComputedStyle(body))) {
				hideOverflow(body);
			}
		}

		if (scrollbarWidth > 0) {
			if (supportsScrollbarGutter()) {
				if (
					!rootStyle.getPropertyValue('scrollbar-gutter').includes('stable')
				) {
					setStyle(root, 'scrollbar-gutter', 'stable');
				}
				const growth = root.getBoundingClientRect().width - rootWidth;
				if (growth > 0.5) {
					fillGap(growth);
				}
			} else {
				fillGap(scrollbarWidth);
			}
		}

		scrollLockRestore = () => {
			for (const restore of restores.reverse()) {
				restore();
			}
		};
	}
	scrollLockCount += 1;

	let released = false;
	return () => {
		if (released) {
			return;
		}
		released = true;
		scrollLockCount -= 1;
		if (scrollLockCount === 0 && scrollLockRestore) {
			scrollLockRestore();
			scrollLockRestore = null;
		}
	};
};

const findFocusRestoreEquivalent = function findFocusRestoreEquivalent(
	element: HTMLElement
): HTMLElement | null {
	if (element.id) {
		const byId = document.getElementById(element.id);
		if (byId) {
			return byId;
		}
	}

	const testId = element.getAttribute('data-testid');
	if (testId) {
		const escaped =
			typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
				? CSS.escape(testId)
				: testId;
		return document.querySelector<HTMLElement>(`[data-testid="${escaped}"]`);
	}

	return null;
};

const containsComposed = function containsComposed(
	target: Element,
	node: Element | null
): boolean {
	let current: Node | null = node;
	while (current) {
		if (current === target || target.contains(current)) {
			return true;
		}
		const root = current.getRootNode();
		current = root instanceof ShadowRoot ? root.host : null;
	}
	return false;
};

const readActiveElement = (): Element | null => {
	let active = document.activeElement;
	while (active?.shadowRoot?.activeElement) {
		active = active.shadowRoot.activeElement;
	}
	return active;
};

export const tabbableElements = function tabbableElements(
	container: HTMLElement
): HTMLElement[] {
	const candidates = getFocusableElements(container).filter(
		(element) => !(element.matches(':disabled') || element.closest('[inert]'))
	);
	const positive = candidates
		.filter((element) => element.tabIndex > 0)
		.sort((left, right) => left.tabIndex - right.tabIndex);
	return [
		...positive,
		...candidates.filter((element) => element.tabIndex === 0),
	];
};

export const firstTabbable = function firstTabbable(
	container: HTMLElement
): HTMLElement | undefined {
	return tabbableElements(container)[0];
};

export interface FocusTrapOptions {
	initialFocus?: 'container' | 'first-tabbable';
}

export const setupFocusTrap = function setupFocusTrap(
	container: HTMLElement,
	options: FocusTrapOptions = {}
) {
	const activeElement = readActiveElement() as HTMLElement | null;
	const previousFocus =
		activeElement &&
		activeElement !== document.body &&
		activeElement !== document.documentElement
			? activeElement
			: lastFocusedElement;

	if (container.tabIndex < 0) {
		container.tabIndex = -1;
	}
	const initialTarget = () =>
		(options.initialFocus === 'first-tabbable'
			? firstTabbable(container)
			: undefined) ?? container;
	const focusTimer = setTimeout(() => {
		try {
			const activeElementLocal = readActiveElement();
			if (
				activeElementLocal instanceof HTMLElement &&
				activeElementLocal !== document.body &&
				container.contains(activeElementLocal)
			) {
				return;
			}
			const target = initialTarget();
			target.focus({ preventScroll: true });
			if (
				target !== container &&
				!containsComposed(target, readActiveElement())
			) {
				container.focus({ preventScroll: true });
			}
		} catch {
		}
	}, 0);

	const handleKeyDown = (e: KeyboardEvent) => {
		if (e.key !== 'Tab') {
			return;
		}

		const elements = tabbableElements(container);
		if (elements.length === 0) {
			return;
		}

		// oxlint-disable-next-line prefer-destructuring -- Preserve declaration order, interface shape, and public compatibility.
		const firstElement = elements[0];
		const lastElement = elements[elements.length - 1];
		const active = readActiveElement() as HTMLElement | null;
		const inside = active
			? active === container || container.contains(active)
			: false;

		const index = active ? elements.indexOf(active) : -1;
		if (index !== -1 && elements.some((element) => element.tabIndex > 0)) {
			e.preventDefault();
			const step = e.shiftKey ? -1 : 1;
			const next = elements[(index + step + elements.length) % elements.length];
			next?.focus({ preventScroll: true });
			return;
		}

		if (
			e.shiftKey &&
			(!inside || active === container || active === firstElement)
		) {
			e.preventDefault();
			lastElement?.focus({ preventScroll: true });
		}
		else if (!e.shiftKey && (!inside || active === lastElement)) {
			e.preventDefault();
			firstElement?.focus({ preventScroll: true });
		}
	};

	document.addEventListener('keydown', handleKeyDown);

	return () => {
		clearTimeout(focusTimer);
		document.removeEventListener('keydown', handleKeyDown);

		if (previousFocus && typeof previousFocus.focus === 'function') {
			setTimeout(() => {
				const target = previousFocus.isConnected
					? previousFocus
					: findFocusRestoreEquivalent(previousFocus);
				target?.focus({ preventScroll: true });
			}, 0);
		}
	};
};
