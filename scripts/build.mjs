import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { build as buildRenderer } from 'vite';
import { buildNode } from './build-node.mjs';
import { rendererOptions } from './renderer.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
await rm(new URL('../dist', import.meta.url), { recursive: true, force: true });
await buildNode();
execFileSync(
	process.execPath,
	[
		fileURLToPath(new URL('../node_modules/typescript/bin/tsc', import.meta.url)),
		'-p',
		'tsconfig.renderer.json',
	],
	{ cwd: root, stdio: 'inherit' },
);
await buildRenderer(rendererOptions);
