import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { build as bundle } from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url));
const resolve = (path) => fileURLToPath(new URL(path, new URL('../', import.meta.url)));
export async function buildNode() {
	const tsc = resolve('node_modules/typescript/bin/tsc');
	execFileSync(process.execPath, [tsc, '-p', 'tsconfig.node.json'], {
		cwd: root,
		stdio: 'inherit',
	});
	// tsc checks preload types; only the single bundled .cjs preload is shipped.
	await rm(resolve('dist/preload'), { recursive: true, force: true });
	await bundle({
		entryPoints: [resolve('src/preload/index.ts')],
		outfile: resolve('dist/preload/index.cjs'),
		bundle: true,
		platform: 'node',
		format: 'cjs',
		external: ['electron'],
		target: 'node24',
		sourcemap: true,
	});
}
