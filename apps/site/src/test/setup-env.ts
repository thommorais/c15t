Object.assign(process.env, {
	NODE_ENV: 'test',
	NEXT_PUBLIC_WEBAPP_URL: 'https://localhost:3000',
	NEXT_PUBLIC_SITE_NAME: 'Thom',
	NEXT_PUBLIC_VAPID_PUBLIC_KEY: 'test-public-key',
	NEXT_PUBLIC_API_URL: 'http://127.0.0.1:8090',
	WEBAPP_URL: 'https://localhost:3000',
	VAPID_PRIVATE_KEY: 'test-private-key',
	API_URL: 'http://127.0.0.1:8090',
})
