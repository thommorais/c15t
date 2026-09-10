import { ENVS } from '_/constants'
import type { TypedPocketBase } from '_/types/pocketbase-types'
import PocketBase from 'pocketbase'

const POCKETBASE_URL = ENVS.NEXT_PUBLIC_API_URL

/**
 * Creates a new PocketBase client instance.
 *
 * For client-side usage, this creates a singleton instance that persists auth state in localStorage.
 * For server-side usage, create a new instance per request to avoid sharing state.
 */
export const createPocketBaseClient = (): TypedPocketBase => {
	const pb = new PocketBase(POCKETBASE_URL) as TypedPocketBase
	if (ENVS.IS_DEV) {
		pb.autoCancellation(false)
	}
	return pb
}

/**
 * Singleton client for browser usage.
 * Do not use this on the server - create a new instance per request instead.
 */
let browserClient: TypedPocketBase | undefined

export const getPocketBaseClient = (): TypedPocketBase => {
	// Client-side: reuse singleton
	if (!browserClient) {
		browserClient = createPocketBaseClient()
	}

	return browserClient
}

/**
 * Generates a PocketBase file URL for accessing uploaded files.
 * @param collectionId - The collection ID or name
 * @param recordId - The record ID
 * @param filename - The filename stored in PocketBase
 * @returns Full URL to access the file, or null if filename is empty
 */
export const getPocketBaseFileUrl = (
	collectionId: string,
	recordId: string,
	filename: string | null | undefined,
): string | null => {
	if (!filename) {
		return null
	}
	return `${POCKETBASE_URL}/api/files/${collectionId}/${recordId}/${filename}`
}
