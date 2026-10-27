type Consent = {
	readonly id: string
	readonly subjectId: string
	readonly domain: string
	readonly action: string
	readonly jurisdiction: string
	readonly uiSource: string
	readonly purposes: number
	readonly givenAt: Date | undefined
	readonly validUntil: Date | undefined
}

export type { Consent }
