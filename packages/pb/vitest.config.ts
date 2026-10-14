import { defineConfig } from 'vitest/config'

const config = defineConfig({
	test: {
		environment: 'happy-dom',
		globals: true,
		include: ['src/**/*.test.ts'],
	},
})

// oxlint-disable-next-line import/no-default-export -- config
export default config
