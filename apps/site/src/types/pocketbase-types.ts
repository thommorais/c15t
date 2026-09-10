/**
* This file was @generated using pocketbase-typegen
*/

import type PocketBase from 'pocketbase'
import type { RecordService } from 'pocketbase'

export enum Collections {
	Authorigins = "_authOrigins",
	Externalauths = "_externalAuths",
	Mfas = "_mfas",
	Otps = "_otps",
	Superusers = "_superusers",
	FlashcardsAnswerEvents = "flashcards_answer_events",
	FlashcardsCardDecks = "flashcards_card_decks",
	FlashcardsCardTags = "flashcards_card_tags",
	FlashcardsCards = "flashcards_cards",
	FlashcardsCategories = "flashcards_categories",
	FlashcardsDeckCategories = "flashcards_deck_categories",
	FlashcardsDecks = "flashcards_decks",
	FlashcardsLeitnerBoxes = "flashcards_leitner_boxes",
	FlashcardsProgressHistory = "flashcards_progress_history",
	FlashcardsStudySessions = "flashcards_study_sessions",
	FlashcardsTags = "flashcards_tags",
	LlmSubmissions = "llm_submissions",
	SubmissionTokens = "submission_tokens",
	Users = "users",
}

// Alias types for improved usability
export type IsoDateString = string
export type IsoAutoDateString = string & { readonly autodate: unique symbol }
export type RecordIdString = string
export type FileNameString = string & { readonly filename: unique symbol }
export type HTMLString = string

type ExpandType<T> = unknown extends T
	? T extends unknown
		? { expand?: unknown }
		: { expand: T }
	: { expand: T }

// System fields
export type BaseSystemFields<T = unknown> = {
	id: RecordIdString
	collectionId: string
	collectionName: Collections
} & ExpandType<T>

export type AuthSystemFields<T = unknown> = {
	email: string
	emailVisibility: boolean
	username: string
	verified: boolean
} & BaseSystemFields<T>

// Record types for each collection

export type AuthoriginsRecord = {
	collectionRef: string
	created: IsoAutoDateString
	fingerprint: string
	id: string
	recordRef: string
	updated: IsoAutoDateString
}

export type ExternalauthsRecord = {
	collectionRef: string
	created: IsoAutoDateString
	id: string
	provider: string
	providerId: string
	recordRef: string
	updated: IsoAutoDateString
}

export type MfasRecord = {
	collectionRef: string
	created: IsoAutoDateString
	id: string
	method: string
	recordRef: string
	updated: IsoAutoDateString
}

export type OtpsRecord = {
	collectionRef: string
	created: IsoAutoDateString
	id: string
	password: string
	recordRef: string
	sentTo?: string
	updated: IsoAutoDateString
}

export type SuperusersRecord = {
	created: IsoAutoDateString
	email: string
	emailVisibility?: boolean
	id: string
	password: string
	tokenKey: string
	updated: IsoAutoDateString
	verified?: boolean
}

export enum FlashcardsAnswerEventsResultOptions {
	"correct" = "correct",
	"incorrect" = "incorrect",
}
export type FlashcardsAnswerEventsRecord = {
	answered_at: IsoDateString
	card_id: RecordIdString
	id: string
	result: FlashcardsAnswerEventsResultOptions
	self_assessed?: boolean
	session_id?: string
	user_answer?: string
	user_id: RecordIdString
}

export type FlashcardsCardDecksRecord = {
	archived_at?: IsoDateString
	card_id: RecordIdString
	deck_id: RecordIdString
	deleted_at?: IsoDateString
	id: string
}

export type FlashcardsCardTagsRecord = {
	card_id: RecordIdString
	id: string
	tag_id: RecordIdString
}

export enum FlashcardsCardsAnswerTypeOptions {
	"multiple_choice" = "multiple_choice",
	"short_answer" = "short_answer",
}
export type FlashcardsCardsRecord<Tanswers = unknown> = {
	answer_rich_text?: HTMLString
	answer_type: FlashcardsCardsAnswerTypeOptions
	answers: null | Tanswers
	archived_at?: IsoDateString
	correct_answer: string
	created_at: IsoAutoDateString
	creator_id: RecordIdString
	deleted_at?: IsoDateString
	difficulty_level?: number
	id: string
	question: string
	question_rich_text?: HTMLString
	updated_at: IsoAutoDateString
}

export type FlashcardsCategoriesRecord = {
	color?: string
	created_at: IsoAutoDateString
	description?: string
	id: string
	name: string
	updated_at: IsoAutoDateString
	user_id: RecordIdString
}

export type FlashcardsDeckCategoriesRecord = {
	category_id: RecordIdString
	deck_id: RecordIdString
	id: string
}

export type FlashcardsDecksRecord = {
	archived_at?: IsoDateString
	card_count?: number
	color: string
	created_at: IsoAutoDateString
	deleted_at?: IsoDateString
	description?: string
	id: string
	is_public?: boolean
	slug: string
	title: string
	updated_at: IsoAutoDateString
	user_id: RecordIdString
}

export type FlashcardsLeitnerBoxesRecord = {
	card_id: RecordIdString
	deck_id: RecordIdString
	id: string
	last_reviewed_at?: IsoDateString
	level: number
	next_review_at?: IsoDateString
	user_id: RecordIdString
}

export type FlashcardsProgressHistoryRecord = {
	average_level?: number
	completion_rate?: number
	deck_id: RecordIdString
	due_cards?: number
	id: string
	learning_cards?: number
	mastered_cards?: number
	new_cards?: number
	review_cards?: number
	reviewed_today?: number
	snapshot_date: IsoDateString
	total_cards?: number
	user_id: RecordIdString
}

export type FlashcardsStudySessionsRecord<Tcards = unknown> = {
	cards?: null | Tcards
	deck_id: RecordIdString
	id: string
	progress?: number
	session_id: string
	state?: string
	user_id: RecordIdString
}

export type FlashcardsTagsRecord = {
	created_at: IsoAutoDateString
	id: string
	name: string
	updated_at: IsoAutoDateString
	user_id: RecordIdString
}

export enum LlmSubmissionsSubmissionTypeOptions {
	"card" = "card",
	"deck" = "deck",
}

export enum LlmSubmissionsStatusOptions {
	"pending" = "pending",
	"approved" = "approved",
	"rejected" = "rejected",
}
export type LlmSubmissionsRecord<Tpayload = unknown> = {
	created: IsoAutoDateString
	created_record_id?: string
	id: string
	payload: null | Tpayload
	payload_hash: string
	processed_at?: IsoDateString
	status: LlmSubmissionsStatusOptions
	submission_type: LlmSubmissionsSubmissionTypeOptions
	token?: string
	updated: IsoAutoDateString
	user_id: RecordIdString
}

export type SubmissionTokensRecord = {
	created: IsoAutoDateString
	expires_at: IsoDateString
	id: string
	scope: string
	submission_count?: number
	token: string
	updated: IsoAutoDateString
	used_at?: IsoDateString
	user_id: RecordIdString
}

export type UsersRecord = {
	avatar?: FileNameString
	created: IsoAutoDateString
	email: string
	emailVisibility?: boolean
	id: string
	name?: string
	password: string
	tokenKey: string
	updated: IsoAutoDateString
	verified?: boolean
}

// Response types include system fields and match responses from the PocketBase API
export type AuthoriginsResponse<Texpand = unknown> = Required<AuthoriginsRecord> & BaseSystemFields<Texpand>
export type ExternalauthsResponse<Texpand = unknown> = Required<ExternalauthsRecord> & BaseSystemFields<Texpand>
export type MfasResponse<Texpand = unknown> = Required<MfasRecord> & BaseSystemFields<Texpand>
export type OtpsResponse<Texpand = unknown> = Required<OtpsRecord> & BaseSystemFields<Texpand>
export type SuperusersResponse<Texpand = unknown> = Required<SuperusersRecord> & AuthSystemFields<Texpand>
export type FlashcardsAnswerEventsResponse<Texpand = unknown> = Required<FlashcardsAnswerEventsRecord> & BaseSystemFields<Texpand>
export type FlashcardsCardDecksResponse<Texpand = unknown> = Required<FlashcardsCardDecksRecord> & BaseSystemFields<Texpand>
export type FlashcardsCardTagsResponse<Texpand = unknown> = Required<FlashcardsCardTagsRecord> & BaseSystemFields<Texpand>
export type FlashcardsCardsResponse<Tanswers = unknown, Texpand = unknown> = Required<FlashcardsCardsRecord<Tanswers>> & BaseSystemFields<Texpand>
export type FlashcardsCategoriesResponse<Texpand = unknown> = Required<FlashcardsCategoriesRecord> & BaseSystemFields<Texpand>
export type FlashcardsDeckCategoriesResponse<Texpand = unknown> = Required<FlashcardsDeckCategoriesRecord> & BaseSystemFields<Texpand>
export type FlashcardsDecksResponse<Texpand = unknown> = Required<FlashcardsDecksRecord> & BaseSystemFields<Texpand>
export type FlashcardsLeitnerBoxesResponse<Texpand = unknown> = Required<FlashcardsLeitnerBoxesRecord> & BaseSystemFields<Texpand>
export type FlashcardsProgressHistoryResponse<Texpand = unknown> = Required<FlashcardsProgressHistoryRecord> & BaseSystemFields<Texpand>
export type FlashcardsStudySessionsResponse<Tcards = unknown, Texpand = unknown> = Required<FlashcardsStudySessionsRecord<Tcards>> & BaseSystemFields<Texpand>
export type FlashcardsTagsResponse<Texpand = unknown> = Required<FlashcardsTagsRecord> & BaseSystemFields<Texpand>
export type LlmSubmissionsResponse<Tpayload = unknown, Texpand = unknown> = Required<LlmSubmissionsRecord<Tpayload>> & BaseSystemFields<Texpand>
export type SubmissionTokensResponse<Texpand = unknown> = Required<SubmissionTokensRecord> & BaseSystemFields<Texpand>
export type UsersResponse<Texpand = unknown> = Required<UsersRecord> & AuthSystemFields<Texpand>

// Types containing all Records and Responses, useful for creating typing helper functions

export type CollectionRecords = {
	_authOrigins: AuthoriginsRecord
	_externalAuths: ExternalauthsRecord
	_mfas: MfasRecord
	_otps: OtpsRecord
	_superusers: SuperusersRecord
	flashcards_answer_events: FlashcardsAnswerEventsRecord
	flashcards_card_decks: FlashcardsCardDecksRecord
	flashcards_card_tags: FlashcardsCardTagsRecord
	flashcards_cards: FlashcardsCardsRecord
	flashcards_categories: FlashcardsCategoriesRecord
	flashcards_deck_categories: FlashcardsDeckCategoriesRecord
	flashcards_decks: FlashcardsDecksRecord
	flashcards_leitner_boxes: FlashcardsLeitnerBoxesRecord
	flashcards_progress_history: FlashcardsProgressHistoryRecord
	flashcards_study_sessions: FlashcardsStudySessionsRecord
	flashcards_tags: FlashcardsTagsRecord
	llm_submissions: LlmSubmissionsRecord
	submission_tokens: SubmissionTokensRecord
	users: UsersRecord
}

export type CollectionResponses = {
	_authOrigins: AuthoriginsResponse
	_externalAuths: ExternalauthsResponse
	_mfas: MfasResponse
	_otps: OtpsResponse
	_superusers: SuperusersResponse
	flashcards_answer_events: FlashcardsAnswerEventsResponse
	flashcards_card_decks: FlashcardsCardDecksResponse
	flashcards_card_tags: FlashcardsCardTagsResponse
	flashcards_cards: FlashcardsCardsResponse
	flashcards_categories: FlashcardsCategoriesResponse
	flashcards_deck_categories: FlashcardsDeckCategoriesResponse
	flashcards_decks: FlashcardsDecksResponse
	flashcards_leitner_boxes: FlashcardsLeitnerBoxesResponse
	flashcards_progress_history: FlashcardsProgressHistoryResponse
	flashcards_study_sessions: FlashcardsStudySessionsResponse
	flashcards_tags: FlashcardsTagsResponse
	llm_submissions: LlmSubmissionsResponse
	submission_tokens: SubmissionTokensResponse
	users: UsersResponse
}

// Utility types for create/update operations

type ProcessCreateAndUpdateFields<T> = Omit<{
	// Omit AutoDate fields
	[K in keyof T as Extract<T[K], IsoAutoDateString> extends never ? K : never]: 
		// Convert FileNameString to File
		T[K] extends infer U ? 
			U extends (FileNameString | FileNameString[]) ? 
				U extends any[] ? File[] : File 
			: U
		: never
}, 'id'>

// Create type for Auth collections
export type CreateAuth<T> = {
	id?: RecordIdString
	email: string
	emailVisibility?: boolean
	password: string
	passwordConfirm: string
	verified?: boolean
} & ProcessCreateAndUpdateFields<T>

// Create type for Base collections
export type CreateBase<T> = {
	id?: RecordIdString
} & ProcessCreateAndUpdateFields<T>

// Update type for Auth collections
export type UpdateAuth<T> = Partial<
	Omit<ProcessCreateAndUpdateFields<T>, keyof AuthSystemFields>
> & {
	email?: string
	emailVisibility?: boolean
	oldPassword?: string
	password?: string
	passwordConfirm?: string
	verified?: boolean
}

// Update type for Base collections
export type UpdateBase<T> = Partial<
	Omit<ProcessCreateAndUpdateFields<T>, keyof BaseSystemFields>
>

// Get the correct create type for any collection
export type Create<T extends keyof CollectionResponses> =
	CollectionResponses[T] extends AuthSystemFields
		? CreateAuth<CollectionRecords[T]>
		: CreateBase<CollectionRecords[T]>

// Get the correct update type for any collection
export type Update<T extends keyof CollectionResponses> =
	CollectionResponses[T] extends AuthSystemFields
		? UpdateAuth<CollectionRecords[T]>
		: UpdateBase<CollectionRecords[T]>

// Type for usage with type asserted PocketBase instance
// https://github.com/pocketbase/js-sdk#specify-typescript-definitions

export type TypedPocketBase = {
	collection<T extends keyof CollectionResponses>(
		idOrName: T
	): RecordService<CollectionResponses[T]>
} & PocketBase
