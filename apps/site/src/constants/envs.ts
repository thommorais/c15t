import { isServerSide } from '_/lib/is-server-side'
import { z } from '_/lib/third-party/zod'

export const EMPTY = 'EMPTY' as const

const flags = {
	IS_PROD: process.env.NODE_ENV === 'production',
	IS_DEV: process.env.NODE_ENV === 'development',
	IS_TEST: process.env.NODE_ENV === 'test',
	IS_CLIENT: !isServerSide(),
	IS_SERVER: isServerSide(),
} as const

const createEnvs = (parsed: MergedSafeParseReturn): Record<ServerEnvsKeys, string> & typeof flags => {
	if (parsed.success === false) {
		const message = 'Invalid environment variables'
		throw new Error(message)
	}

	const extendedEnvs = {
		...parsed.data,
		...flags,
	}

	const ENVS = new Proxy(extendedEnvs, {
		get(target, prop) {
			if (typeof prop !== 'string') return undefined

			if (prop in flags) {
				return Reflect.get(target, prop)
			}

			if (!isServerSide() && !prop.startsWith('NEXT_PUBLIC_')) {
				const errorMessage = 'Not allowed to access server-side environment variables on the client'
				throw new Error(process.env.NODE_ENV === 'production' ? errorMessage : `${errorMessage} - '${prop}'`)
			}
			return Reflect.get(target, prop)
		},
	})

	return ENVS
}

const clientSchema = z.object({
	NODE_ENV: z.enum(['development', 'test', 'production']),
	NEXT_PUBLIC_WEBAPP_URL: z.string().url().default('https://localhost:3000'),
	NEXT_PUBLIC_SITE_NAME: z.string().default('Thom'),
	WEBAPP_URL: z.string().url().default('https://localhost:3000'),
	NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string(),
	NEXT_PUBLIC_API_URL: z.string().url().default('http://127.0.0.1:8090'),
})

// Client-side env vars are also available on the server
const serverSchema = z
	.object({
		VAPID_PRIVATE_KEY: z.string(),
		API_URL: z.string().url().default('http://127.0.0.1:8090'),
	})
	.merge(clientSchema)

type ServerEnvs = z.infer<typeof serverSchema>
type ClientEnvs = z.infer<typeof clientSchema>
type ServerEnvsKeys = keyof ServerEnvs
type ClientEnvsKeys = keyof ClientEnvs
type PROCESS_ENV = Record<
	ServerEnvsKeys | ClientEnvsKeys,
	(typeof process.env)[Extract<ServerEnvsKeys | ClientEnvsKeys, string | number>]
>

// Don't touch
// --------------------------
type MergedSafeParseReturn = z.SafeParseReturnType<z.input<typeof serverSchema>, ServerEnvs>

const parseEnvs = (
	processEnv: PROCESS_ENV,
	clientSchema: z.ZodSchema,
	serverSchema: z.ZodSchema,
): MergedSafeParseReturn => {
	const schema = isServerSide() ? serverSchema : clientSchema
	return schema.safeParse(processEnv)
}

const processEnv: PROCESS_ENV = {
	// Server-side env vars
	NODE_ENV: process.env.NODE_ENV,
	WEBAPP_URL: process.env.WEBAPP_URL,
	VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY,
	API_URL: process.env.API_URL,

	// Client-side env vars
	NEXT_PUBLIC_SITE_NAME: process.env.NEXT_PUBLIC_SITE_NAME ?? process.env.NEXT_PUBLIC_APP_NAME,
	NEXT_PUBLIC_WEBAPP_URL: process.env.NEXT_PUBLIC_WEBAPP_URL,
	NEXT_PUBLIC_VAPID_PUBLIC_KEY: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
	NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
}

const ENVS = createEnvs(parseEnvs(processEnv, clientSchema, serverSchema))
export { ENVS }
