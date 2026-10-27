export const MINIMAL_GVL = {
	features: {
		1: {
			description: '',
			id: 1,
			illustrations: [
				'A retailer combines the data it collected with data from a partner to reach you with an offer.',
			],
			name: 'Match and combine data',
		},
	},
	gvlSpecificationVersion: 3,
	lastUpdated: '2024-01-15T16:00:23Z',
	purposes: {
		1: {
			description: '',
			id: 1,
			illustrations: [],
			name: 'Store and/or access information on a device',
		},
		2: {
			description: '',
			id: 2,
			illustrations: [],
			name: 'Use limited data to select advertising',
		},
	},
	specialFeatures: {
		1: {
			description: '',
			id: 1,
			illustrations: [],
			name: 'Use precise geolocation data',
		},
	},
	specialPurposes: {
		1: { description: '', id: 1, illustrations: [], name: 'Security' },
	},
	stacks: {
		1: {
			description: '',
			id: 1,
			name: 'Conformance Test Stack',
			purposes: [2],
			specialFeatures: [],
		},
	},
	standardTexts: {
		features:
			'These means of processing can be used solely in pursuit of one or several purposes for which you are given a choice in this notice.',
	},
	tcfPolicyVersion: 5,
	vendorListVersion: 142,
	vendors: {
		755: {
			cookieMaxAgeSeconds: 0,
			cookieRefresh: false,
			features: [1],
			flexiblePurposes: [],
			id: 755,
			legIntPurposes: [],
			name: 'Conformance Test Vendor',
			purposes: [1, 2],
			specialFeatures: [1],
			specialPurposes: [1],
			urls: [],
			usesCookies: false,
			usesNonCookieAccess: false,
		},
	},
} as const;

export const IAB_FIXTURE_CMP_ID = 160;
export const IAB_FIXTURE_CMP_VERSION = 1;
