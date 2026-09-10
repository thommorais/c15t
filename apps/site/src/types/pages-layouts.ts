type LocaleType = {
	locale: string
}

export type Param = string | string[] | undefined
export type Params = Record<string, Param> & LocaleType

export type SearchParams = {
	[param: string]: Param
}

export type PageProps = {
	params: Promise<Params>
	searchParams: Promise<SearchParams>
}

export type LayoutProps = { params: Promise<Params>; children: React.ReactNode }
