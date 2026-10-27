export type GPPCmpStatus = 'stub' | 'loading' | 'loaded' | 'error';

export type GPPDisplayStatus = 'hidden' | 'visible' | 'disabled';

export type GPPSignalStatus = 'not ready' | 'ready';

export type GPPParsedSubsection = Record<string, unknown>;

export interface GPPPingData {
	gppVersion: string;
	cmpStatus: GPPCmpStatus;
	cmpDisplayStatus: GPPDisplayStatus;
	signalStatus: GPPSignalStatus;
	supportedAPIs: string[];
	cmpId: number;
	sectionList: number[];
	applicableSections: number[];
	gppString: string;
	parsedSections: Record<string, GPPParsedSubsection[]>;
}

export interface GPPEventData {
	eventName: string;
	listenerId: number;
	data: unknown;
	pingData: GPPPingData;
}

export type GPPCallback<DataType = unknown> = (
	data: DataType,
	success: boolean
) => void;

export interface GPPQueuedListener {
	id: number;
	callback: GPPCallback<GPPEventData>;
	parameter?: unknown;
}

export type GPPApi = (
	command?: string,
	handler?: GPPCallback,
	parameter?: unknown,
	version?: string
) => unknown;

declare global {
	interface Window {
		__gpp?: GPPApi;
	}
}
