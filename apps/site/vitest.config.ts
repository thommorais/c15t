import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// oxlint-disable-next-line import/no-default-export -- config
export default defineConfig({
	plugins: [react()],
	test: {
		environment: 'happy-dom',
		globals: true,
		setupFiles: ['src/test/setup-env.ts'],
	},
	resolve: {
		alias: {
			_: path.resolve(__dirname, './src'),
		},
	},
})
