'use client';

import { useContext, useEffect, useSyncExternalStore, version } from 'react';

import { GlobalThemeContext } from '~/context/theme-context';
import { useUIConfig } from '~/ui-config-context';

export interface SurfaceStyleSheet {
	id: string;
	css: string;
	load?: () => Promise<string>;
}

const loadedCss = new Map<string, string>();
const hoistedInPage = new Set<string>();
const pendingLoads = new Map<string, Promise<void>>();
const failedLoads = new Set<string>();
const listeners = new Set<() => void>();
let sheetsVersion = 0;
const getSheetsVersion = (): number => sheetsVersion;
const getServerSheetsVersion = (): number => 0;

const notify = function notify(): void {
	sheetsVersion += 1;
	for (const listener of listeners) {
		listener();
	}
};

const subscribe = function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
};

const findInPage = function findInPage(id: string): boolean {
	if (hoistedInPage.has(id) || loadedCss.has(id)) {
		return true;
	}
	if (typeof document === 'undefined') {
		return false;
	}
	if (document.querySelector(`style[data-href~="${id}"]`)) {
		hoistedInPage.add(id);
		return true;
	}
	const inPlace = document.querySelector(`style[data-c15t-styles="${id}"]`);
	if (inPlace?.textContent) {
		loadedCss.set(id, inPlace.textContent);
		return true;
	}
	return false;
};

const isSheetReady = (sheet: SurfaceStyleSheet): boolean =>
	!sheet.load || failedLoads.has(sheet.id) || findInPage(sheet.id);

const loadSheet = async function loadSheet(
	id: string,
	load: () => Promise<string>
): Promise<void> {
	try {
		loadedCss.set(id, await load());
		failedLoads.delete(id);
	} catch (error) {
		pendingLoads.delete(id);
		failedLoads.add(id);
		throw error;
	} finally {
		notify();
	}
};

export const preloadSurfaceSheets = async function preloadSurfaceSheets(
	sheets: readonly SurfaceStyleSheet[]
): Promise<void> {
	const loads: Promise<void>[] = [];
	for (const sheet of sheets) {
		const { id, load } = sheet;
		if (!load || findInPage(id)) {
			continue;
		}
		let pending = pendingLoads.get(id);
		if (!pending) {
			pending = loadSheet(id, load);
			pendingLoads.set(id, pending);
		}
		loads.push(pending);
	}
	try {
		await Promise.all(loads);
	} catch {
	}
};

const HOISTS_STYLES = Number.parseInt(version, 10) >= 19;

const PRECEDENCE = 'c15t';

const useStylesDisabled = function useStylesDisabled(
	noStyle: boolean | undefined
): boolean {
	const { styles } = useUIConfig();
	const globalTheme = useContext(GlobalThemeContext);
	return styles === false || Boolean(noStyle) || Boolean(globalTheme.noStyle);
};

export const useSurfaceSheetsReady = function useSurfaceSheetsReady(
	sheets: readonly SurfaceStyleSheet[],
	noStyle?: boolean
): boolean {
	const disabled = useStylesDisabled(noStyle);
	const ready = useSyncExternalStore(
		subscribe,
		() => disabled || sheets.every(isSheetReady),
		() => true
	);
	useEffect(() => {
		if (!disabled) {
			void preloadSurfaceSheets(sheets);
		}
	}, [disabled, sheets]);
	return ready;
};

export const SurfaceStyles = ({
	sheets,
	noStyle,
}: {
	sheets: readonly SurfaceStyleSheet[];
	noStyle?: boolean;
}) => {
	const { nonce } = useUIConfig();
	useSyncExternalStore(subscribe, getSheetsVersion, getServerSheetsVersion);
	if (useStylesDisabled(noStyle)) {
		return null;
	}
	const hoist = HOISTS_STYLES && !nonce;
	return sheets.map((sheet) => {
		let { css } = sheet;
		if (sheet.load) {
			if (!findInPage(sheet.id)) {
				return null;
			}
			css = loadedCss.get(sheet.id) ?? '';
		}
		return hoist ? (
			<style
				key={sheet.id}
				href={sheet.id}
				precedence={PRECEDENCE}
			>
				{css}
			</style>
		) : (
			<style
				key={sheet.id}
				data-c15t-styles={sheet.id}
				nonce={nonce}
				// oxlint-disable-next-line react/no-danger -- c15t's own build-time CSS.
				dangerouslySetInnerHTML={{ __html: css }}
			/>
		);
	});
};
