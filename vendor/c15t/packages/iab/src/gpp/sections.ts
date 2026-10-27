export const GPP_VERSION = '1.1';

export const GPP_HEADER_ID = 3;

export const GPP_HEADER_VERSION = 1;

export const TCF_EU_SECTION_ID = 2;

export const TCF_EU_PREFIX = 'tcfeuv2';

export type GPPFieldSpec = readonly [
	name: string,
	bits: number,
	count?: number,
];

export type USSectionPrefix =
	| 'usnat'
	| 'usca'
	| 'usva'
	| 'usco'
	| 'usut'
	| 'usct'
	| 'usfl'
	| 'usmt'
	| 'usor'
	| 'ustx'
	| 'usde'
	| 'usia'
	| 'usne'
	| 'usnh'
	| 'usnj'
	| 'ustn'
	| 'usmn';

export interface USSectionDefinition {
	id: number;
	prefix: USSectionPrefix;
	version: number;
	core: readonly GPPFieldSpec[];
	gpc: boolean;
}

export const GPC_SUBSECTION: readonly GPPFieldSpec[] = [
	['SubsectionType', 2],
	['Gpc', 1],
];

export const GPC_SUBSECTION_TYPE = 1;

const int = (name: string): GPPFieldSpec => [name, 2];
const list = (name: string, count: number): GPPFieldSpec => [name, 2, count];
const VERSION: GPPFieldSpec = ['Version', 6];
const MSPA: readonly GPPFieldSpec[] = [
	int('MspaCoveredTransaction'),
	int('MspaOptOutOptionMode'),
	int('MspaServiceProviderMode'),
];

const childConsents = (count: number): GPPFieldSpec =>
	count === 1
		? int('KnownChildSensitiveDataConsents')
		: list('KnownChildSensitiveDataConsents', count);

const sharingNoticeLayout = (
	sensitive: number,
	children: number
): GPPFieldSpec[] => [
	VERSION,
	int('SharingNotice'),
	int('SaleOptOutNotice'),
	int('TargetedAdvertisingOptOutNotice'),
	int('SaleOptOut'),
	int('TargetedAdvertisingOptOut'),
	list('SensitiveDataProcessing', sensitive),
	childConsents(children),
	...MSPA,
];

const processingNoticeLayout = (
	sensitive: number,
	children: number,
	firstNotice = 'ProcessingNotice'
): GPPFieldSpec[] => [
	VERSION,
	int(firstNotice),
	int('SaleOptOutNotice'),
	int('TargetedAdvertisingOptOutNotice'),
	int('SaleOptOut'),
	int('TargetedAdvertisingOptOut'),
	list('SensitiveDataProcessing', sensitive),
	childConsents(children),
	int('AdditionalDataProcessingConsent'),
	...MSPA,
];

export const US_NATIONAL_SECTION: USSectionDefinition = {
	core: [
		VERSION,
		int('SharingNotice'),
		int('SaleOptOutNotice'),
		int('SharingOptOutNotice'),
		int('TargetedAdvertisingOptOutNotice'),
		int('SensitiveDataProcessingOptOutNotice'),
		int('SensitiveDataLimitUseNotice'),
		int('SaleOptOut'),
		int('SharingOptOut'),
		int('TargetedAdvertisingOptOut'),
		list('SensitiveDataProcessing', 16),
		list('KnownChildSensitiveDataConsents', 3),
		int('PersonalDataConsents'),
		...MSPA,
	],
	gpc: true,
	id: 7,
	prefix: 'usnat',
	version: 2,
};

const state = (
	id: number,
	prefix: USSectionPrefix,
	core: GPPFieldSpec[],
	gpc = true
): USSectionDefinition => ({ core, gpc, id, prefix, version: 1 });

export const US_STATE_SECTIONS: Readonly<Record<string, USSectionDefinition>> =
	{
		CA: state(8, 'usca', [
			VERSION,
			int('SaleOptOutNotice'),
			int('SharingOptOutNotice'),
			int('SensitiveDataLimitUseNotice'),
			int('SaleOptOut'),
			int('SharingOptOut'),
			list('SensitiveDataProcessing', 9),
			list('KnownChildSensitiveDataConsents', 2),
			int('PersonalDataConsents'),
			...MSPA,
		]),
		CO: state(10, 'usco', sharingNoticeLayout(7, 1)),
		CT: state(12, 'usct', sharingNoticeLayout(8, 3)),
		DE: state(17, 'usde', processingNoticeLayout(9, 5)),
		FL: state(13, 'usfl', processingNoticeLayout(8, 3), false),
		IA: state(18, 'usia', [
			VERSION,
			int('ProcessingNotice'),
			int('SaleOptOutNotice'),
			int('TargetedAdvertisingOptOutNotice'),
			int('SensitiveDataOptOutNotice'),
			int('SaleOptOut'),
			int('TargetedAdvertisingOptOut'),
			list('SensitiveDataProcessing', 8),
			int('KnownChildSensitiveDataConsents'),
			...MSPA,
		]),
		MN: state(23, 'usmn', processingNoticeLayout(8, 1)),
		MT: state(14, 'usmt', processingNoticeLayout(8, 3, 'SharingNotice')),
		NE: state(19, 'usne', processingNoticeLayout(8, 1)),
		NH: state(20, 'usnh', processingNoticeLayout(8, 3)),
		NJ: state(21, 'usnj', processingNoticeLayout(10, 5)),
		OR: state(15, 'usor', processingNoticeLayout(11, 3)),
		TN: state(22, 'ustn', processingNoticeLayout(8, 1)),
		TX: state(16, 'ustx', processingNoticeLayout(8, 1)),
		UT: state(
			11,
			'usut',
			[
				VERSION,
				int('SharingNotice'),
				int('SaleOptOutNotice'),
				int('TargetedAdvertisingOptOutNotice'),
				int('SensitiveDataProcessingOptOutNotice'),
				int('SaleOptOut'),
				int('TargetedAdvertisingOptOut'),
				list('SensitiveDataProcessing', 8),
				int('KnownChildSensitiveDataConsents'),
				...MSPA,
			],
			false
		),
		VA: state(9, 'usva', sharingNoticeLayout(8, 1), false),
	};

export const US_SECTIONS: readonly USSectionDefinition[] = [
	US_NATIONAL_SECTION,
	...Object.values(US_STATE_SECTIONS),
].sort((left, right) => left.id - right.id);
