import PocketBase from 'pocketbase'

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8090'

const client = new PocketBase(API_URL)

client.autoCancellation(false)

export { client }
