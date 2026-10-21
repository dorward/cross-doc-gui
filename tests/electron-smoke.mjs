import { spawn } from 'node:child_process';
import { cp, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import electron from 'electron';

const temporary = await realpath(await mkdtemp(join(tmpdir(), 'cross-doc-gui-electron-')));
const project = join(temporary, 'project');
await cp(new URL('fixtures/project/', import.meta.url), project, { recursive: true });
await mkdir(join(temporary, 'bin'));
await writeFile(
	join(temporary, 'bin', 'prince'),
	`#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
if (!process.argv.includes('--no-network')) throw new Error('Expected disabled network');
if (fs.existsSync(path.join(process.env.CROSS_DOC_GUI_TEST_DATA, 'fail-prince'))) {
  process.stderr.write('Fake renderer failure'); process.exitCode = 4;
} else {
  fs.writeFileSync(process.argv[process.argv.indexOf('-o') + 1], 'fake-pdf-process-fixture');
}
`,
	{ mode: 0o755 },
);
const env = {
	...process.env,
	CROSS_DOC_GUI_TEST_DATA: temporary,
	CROSS_DOC_GUI_TEST_PROJECT: project,
	PATH: `${join(temporary, 'bin')}:${process.env.PATH}`,
};
delete env.ELECTRON_RUN_AS_NODE;
try {
	const code = await new Promise((resolve, reject) => {
		const child = spawn(
			electron,
			[fileURLToPath(new URL('helpers/electron-entry.mjs', import.meta.url))],
			{
				cwd: temporary,
				env,
				stdio: 'inherit',
			},
		);
		const timeout = setTimeout(() => {
			child.kill();
			reject(new Error('Electron smoke test timed out'));
		}, 30000);
		child.on('error', (error) => {
			clearTimeout(timeout);
			reject(error);
		});
		child.on('exit', (status) => {
			clearTimeout(timeout);
			resolve(status);
		});
	});
	if (code !== 0) throw new Error(`Electron smoke test exited ${code}`);
} finally {
	await rm(temporary, { recursive: true, force: true });
}
