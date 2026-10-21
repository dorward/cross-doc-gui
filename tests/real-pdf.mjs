import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, realpath, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import electron from 'electron';
import { PrinceConfiguration, executable } from '../dist/main/prince.js';

const temporary = await realpath(await mkdtemp(join(tmpdir(), 'gui-real-pdf-')));
try {
	const project = join(temporary, 'project Ω');
	await cp(new URL('fixtures/project/', import.meta.url), project, { recursive: true });
	const binary = process.env.CROSS_DOC_PRINCE_BINARY
		? await executable(process.env.CROSS_DOC_PRINCE_BINARY)
		: await new PrinceConfiguration(join(temporary, 'lookup.json'), async () => null).resolve();
	const env = {
		...process.env,
		CROSS_DOC_GUI_TEST_DATA: temporary,
		CROSS_DOC_GUI_TEST_PROJECT: project,
		CROSS_DOC_PRINCE_BINARY: binary,
	};
	delete env.ELECTRON_RUN_AS_NODE;
	await new Promise((resolve, reject) => {
		const child = spawn(
			electron,
			[fileURLToPath(new URL('helpers/pdf-entry.mjs', import.meta.url))],
			{ cwd: temporary, env, stdio: 'inherit' },
		);
		const timer = setTimeout(() => {
			child.kill();
			reject(new Error('Real PDF check timed out'));
		}, 45000);
		child.on('error', (error) => {
			clearTimeout(timer);
			reject(error);
		});
		child.on('exit', (code) => {
			clearTimeout(timer);
			if (code === 0) resolve();
			else reject(new Error(`PDF Electron check exited ${code}`));
		});
	});
	const pdf = join(project, 'out', 'auto.pdf');
	const info = execFileSync('pdfinfo', [pdf], { encoding: 'utf8' });
	const text = execFileSync('pdftotext', [pdf, '-'], { encoding: 'utf8' });
	assert.match(info, /Pages:\s+4\b/);
	for (const expected of ['Alice', 'Bob', 'Ada', 'Arrival', 'Departure', 'Courage'])
		assert.ok(text.includes(expected), expected);
	execFileSync('pdftoppm', ['-scale-to', '1200', '-png', pdf, join(temporary, 'page')]);
	console.log(
		'Real Prince: four pages, fixture text, rendered page PNGs and actual Electron PDF viewer passed.',
	);
	if (process.env.CROSS_DOC_PDF_ARTIFACT_DIR) {
		const output = process.env.CROSS_DOC_PDF_ARTIFACT_DIR;
		await mkdir(output, { recursive: true });
		await cp(join(project, 'out'), join(output, 'out'), { recursive: true });
		for (const filename of await readdir(temporary)) {
			if (/^(?:page-\d+|viewer)\.png$/.test(filename))
				await cp(join(temporary, filename), join(output, filename));
		}
		console.log(`Review artifacts: ${output}`);
	}
} finally {
	await rm(temporary, { recursive: true, force: true });
}
