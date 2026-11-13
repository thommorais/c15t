import { execFileSync, spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { setTimeout } from 'node:timers/promises'

export const startGoServer = async (origin = 'https://shop.example') => {
	const directory = await mkdtemp(resolve(tmpdir(), 'c15t-integration-'))
	const binary = resolve(directory, 'api.test')
	const config = resolve(directory, 'server.json')
	const cwd = new URL('../apps/base/', import.meta.url)
	execFileSync('go', ['test', '-c', '-o', binary, './api'], {
		cwd,
		env: { ...process.env, GOCACHE: '/private/tmp/c15t-evaluation-gocache' },
		stdio: 'pipe',
	})
	const child = spawn(binary, ['-test.run=^TestGoTransportServer$', '-test.timeout=180s'], {
		cwd,
		env: { ...process.env, C15T_TEST_SERVER_FILE: config, C15T_TEST_ORIGIN: origin },
		stdio: 'pipe',
	})
	let log = ''
	child.stdout.on('data', data => {
		log += data
	})
	child.stderr.on('data', data => {
		log += data
	})
	let exited = false
	const exit = new Promise(done =>
		child.once('exit', () => {
			exited = true
			done()
		}),
	)
	const close = async () => {
		if (!exited) child.kill('SIGTERM')
		await exit
		await rm(directory, { recursive: true, force: true })
	}
	try {
		for (let attempt = 0; attempt < 100; attempt++) {
			if (exited) throw new Error(`Go fixture stopped: ${log}`)
			const contents = await readFile(config, 'utf8').catch(() => undefined)
			if (contents)
				return {
					...JSON.parse(contents),
					close,
					changePolicy: revision => writeFile(`${config}.revision`, revision, { mode: 0o600 }),
				}
			await setTimeout(100)
		}
		throw new Error(`Go fixture did not start: ${log}`)
	} catch (error) {
		await close()
		throw error
	}
}
