export interface GoTestServer {
	backendURL: string
	apiKey: string
	secretKey: string
	close(): Promise<void>
	changePolicy(revision: string): Promise<void>
}
export function startGoServer(origin?: string): Promise<GoTestServer>
