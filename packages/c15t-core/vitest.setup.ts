import { vi } from 'vitest';
import 'vitest-localstorage-mock';

import { preloadPersistenceWriter } from './src/modules/persistence/mount';

const mockStorage = {
	clear: vi.fn(() => mockStorage.store.clear()),
	getItem: vi.fn((key) => mockStorage.store.get(key) || null),
	key: vi.fn(() => null),
	length: 0,
	removeItem: vi.fn((key) => mockStorage.store.delete(key)),
	setItem: vi.fn((key, value) => mockStorage.store.set(key, value)),
	store: new Map(),
};

const mockWindow = {
	XMLHttpRequest: class MockXMLHttpRequest {
		static UNSENT = 0;
		static OPENED = 1;
		static HEADERS_RECEIVED = 2;
		static LOADING = 3;
		static DONE = 4;

		onreadystatechange = null;
		readyState = 0;
		response = null;
		responseText = '';
		responseType = '';
		status = 0;
		statusText = '';

		open = vi.fn();
		send = vi.fn();
		abort = vi.fn();
		setRequestHeader = vi.fn();
		getResponseHeader = vi.fn();
		getAllResponseHeaders = vi.fn();
	},
	fetch: vi.fn(() => Promise.resolve(new Response())),
	localStorage: mockStorage,
	location: {
		hash: '',
		href: 'https://test.example.com/',
		origin: 'https://test.example.com',
		pathname: '/',
		search: '',
	},
};

if (typeof window === 'undefined') {
	vi.stubGlobal('window', mockWindow);
}

if (typeof location === 'undefined') {
	vi.stubGlobal('location', mockWindow.location);
}

if (typeof document === 'undefined') {
	vi.stubGlobal('document', {
		addEventListener: vi.fn(),
		cookie: '',
		createElement: vi.fn(),
		dispatchEvent: vi.fn(),
		querySelector: vi.fn(),
		removeEventListener: vi.fn(),
	});
}

const fetchMock = vi
	.fn()
	.mockImplementation(() => Promise.resolve(new Response()));
vi.stubGlobal('fetch', fetchMock);

export const mockLocalStorage = mockStorage;
export const mockDocument = globalThis.document;
export { fetchMock };

export const createRejectingFetch = function createRejectingFetch(
	predicateFn: (url: string, options?: RequestInit) => boolean
) {
	return vi.fn().mockImplementation((url: string, options?: RequestInit) => {
		if (predicateFn(url, options)) {
			return Promise.reject(
				new Error(`Request to ${url} blocked due to missing consent`)
			);
		}
		return Promise.resolve(new Response());
	});
};

await preloadPersistenceWriter();
