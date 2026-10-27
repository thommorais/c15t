import PocketBase from 'pocketbase'

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8090'

const client = new PocketBase(API_URL)

// Two components reading the same list at once is ordinary here, and
// auto-cancellation would abort one of them.
client.autoCancellation(false)

export { client }
