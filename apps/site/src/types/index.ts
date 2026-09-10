type IsoDateString = string
type RecordIdString = string
type HTMLString = string
type DateType = string | null | Date

// oxlint-disable-next-line typescript/no-explicit-any -- to avoid breaking changes
type ANY = any
interface BaseModel {
	[key: string]: ANY
	id: string
}

interface RecordModel extends BaseModel {
	collectionId: string
	collectionName: string
	expand?: {
		[key: string]: ANY
	}
}

type Primitive = null | undefined | string | number | boolean | symbol | bigint

export type { ANY, DateType, HTMLString, IsoDateString, Primitive, RecordIdString, RecordModel }
