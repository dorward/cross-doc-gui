import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { api } from '@electron-forge/core';

if (!['darwin', 'linux'].includes(process.platform))
	throw new Error('Packaging is configured for macOS/Linux hosts only.');
const root = fileURLToPath(new URL('../', import.meta.url));
const outDir = join(root, 'out');
// Remove previous applications and makers before Forge's overwrite handling.
// Retry transient ENOTEMPTY/EBUSY errors from macOS filesystem activity.
await rm(outDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
const stage = await mkdtemp(join(tmpdir(), 'cross-doc-gui-stage-'));
try {
	// Legacy deploy supports the intentionally retained sibling file dependency;
	// it uses the committed graph and creates a portable, local virtual store.
	execFileSync(
		process.env.npm_execpath || 'pnpm',
		['--filter', 'cross-doc-gui', 'deploy', '--legacy', '--prod', '--ignore-scripts', stage],
		{ cwd: root, stdio: 'inherit' },
	);
	const filename = join(stage, 'package.json');
	const manifest = JSON.parse(await readFile(filename, 'utf8'));
	const library = JSON.parse(
		await readFile(join(stage, 'node_modules/cross-doc/package.json'), 'utf8'),
	);
	manifest.dependencies['cross-doc'] = library.version;
	manifest.config = { forge: './forge.config.mjs' };
	// Runtime ESM dependencies must be real sibling resources, not ASAR symlinks.
	await writeFile(
		join(stage, 'forge.config.mjs'),
		`import config from ${JSON.stringify(new URL('../forge.config.mjs', import.meta.url).href)};
config.packagerConfig.extraResource = [${JSON.stringify(join(stage, 'node_modules'))}];
export default config;
`,
	);
	await writeFile(filename, JSON.stringify(manifest, null, 2) + '\n');
	const options = { dir: stage, outDir, interactive: false };
	if (process.argv.includes('--make')) await api.make(options);
	else await api.package(options);
} finally {
	await rm(stage, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
