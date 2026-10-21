import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { rm } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import electron from 'electron';
import react from '@vitejs/plugin-react';
import { createServer } from 'vite';
import { buildNode } from './build-node.mjs';
import { rendererOptions } from './renderer.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));

export async function startDevelopment({
	launch = (env) => spawn(electron, [root], { env, stdio: 'inherit' }),
} = {}) {
	let child;
	let closing = false;
	let timer;
	let pending = Promise.resolve();
	const server = await createServer({
		...rendererOptions,
		plugins: [
			...rendererOptions.plugins,
			react(),
			{
				name: 'development-csp',
				transformIndexHtml: {
					order: 'pre',
					handler: (html) =>
						html
							.replace("script-src 'self';", "script-src 'self' 'unsafe-inline';")
							.replace("connect-src 'none';", "connect-src 'self' ws://127.0.0.1:*;"),
				},
			},
		],
		server: { host: '127.0.0.1', port: 5173, strictPort: true, fs: { allow: [root] } },
	});
	async function stopElectron() {
		if (!child || child.exitCode !== null || child.signalCode !== null) return;
		const stopped = once(child, 'exit');
		child.kill('SIGTERM');
		const timeout = setTimeout(() => child?.kill('SIGKILL'), 5000);
		try {
			await stopped;
		} finally {
			clearTimeout(timeout);
		}
	}
	async function restart() {
		await stopElectron();
		if (closing) return;
		await buildNode();
		if (closing) return;
		const env = { ...process.env, CROSS_DOC_DEV_SERVER_URL: server.resolvedUrls.local[0] };
		delete env.ELECTRON_RUN_AS_NODE;
		child = await launch(env);
		child.on('error', (error) => console.error(error));
		console.log('Electron started with React Fast Refresh.');
	}
	async function close() {
		if (closing) return;
		closing = true;
		clearTimeout(timer);
		await pending;
		await stopElectron();
		await server.close();
	}
	try {
		await server.listen();
		await rm(join(root, 'dist'), { recursive: true, force: true });
		server.printUrls();
		await restart();
		server.watcher.add(
			['main', 'preload', 'shared', 'utility'].map((directory) => join(root, 'src', directory)),
		);
		server.watcher.on('all', (_event, filename) => {
			const path = relative(join(root, 'src'), filename).split(sep);
			if (closing || !['main', 'preload', 'shared', 'utility'].includes(path[0])) return;
			clearTimeout(timer);
			timer = setTimeout(() => {
				pending = pending
					.then(restart)
					.catch((error) =>
						console.error('Electron rebuild failed; fix the source to retry.', error),
					);
			}, 150);
		});
		return { server, close };
	} catch (error) {
		await close();
		throw error;
	}
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
	const development = await startDevelopment();
	for (const signal of ['SIGINT', 'SIGTERM'])
		process.once(signal, () => {
			void development.close();
		});
}
