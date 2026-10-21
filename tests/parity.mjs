import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cp, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron } from 'playwright';
import electron from 'electron';
import { loadProject } from 'cross-doc';

// Workspace acceptance check: deliberately tests the sibling CLI, not a new GUI dependency.
const root = fileURLToPath(new URL('../', import.meta.url));
const cli = resolve(root, '../cross-doc-cli');
const temporary = await realpath(await mkdtemp(join(tmpdir(), 'cross-doc-parity-')));
const project = join(temporary, 'project Ω');
const realPdf = process.argv.includes('--pdf');
let application;
const diagnostics = (items) =>
	items.map(({ code, source, target }) => JSON.stringify([code, source, target])).sort();
const summaries = (items) =>
	items
		.map(({ slug, title, category }) => ({ slug, title, category }))
		.sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
function command(args) {
	const result = spawnSync(process.execPath, [join(cli, 'dist/index.js'), '-p', project, ...args], {
		cwd: project,
		encoding: 'utf8',
		timeout: 45000,
		env: { ...process.env, TZ: 'UTC' },
	});
	assert.ifError(result.error);
	return result;
}
function inspection(args = []) {
	const result = command(['--inspect', '--json', ...args]);
	assert.equal(result.stderr, '');
	return { status: result.status, value: JSON.parse(result.stdout) };
}
function renderedPdf(path) {
	if (!realPdf) return readFile(path, 'utf8');
	const info = execFileSync('pdfinfo', [path], { encoding: 'utf8' });
	const pages = info.match(/^Pages:\s+(\d+)/m);
	assert.ok(pages && Number(pages[1]) > 0, 'PDF must have a valid page count');
	return {
		pages: Number(pages[1]),
		text: execFileSync('pdftotext', [path, '-'], { encoding: 'utf8' }),
	};
}
try {
	execFileSync(process.execPath, [join(cli, 'scripts/build.mjs')], { cwd: cli, stdio: 'inherit' });
	await cp(new URL('fixtures/project/', import.meta.url), project, { recursive: true });
	const fake = join(temporary, 'fake prince');
	await writeFile(
		fake,
		`#!/usr/bin/env node
require('node:fs').writeFileSync(process.argv[process.argv.indexOf('-o')+1],'parity-pdf');
`,
		{ mode: 0o755 },
	);
	const { PrinceConfiguration } = await import('../dist/main/prince.js');
	const prince = realPdf
		? (process.env.CROSS_DOC_PRINCE_BINARY ??
			(await new PrinceConfiguration(join(temporary, 'lookup.json'), async () => null).resolve()))
		: fake;
	const env = { ...process.env, TZ: 'UTC' };
	delete env.ELECTRON_RUN_AS_NODE;
	delete env.CROSS_DOC_DEV_SERVER_URL;
	application = await _electron.launch({
		executablePath: electron,
		args: [root, '--user-data-dir=' + join(temporary, 'profile')],
		cwd: temporary,
		env,
		timeout: 30000,
	});
	await application.evaluate(
		({ dialog, shell }, { project, prince }) => {
			dialog.showOpenDialog = async (_window, options) => ({
				canceled: false,
				filePaths: [options.properties.includes('openFile') ? prince : project],
			});
			shell.showItemInFolder = () => {};
		},
		{ project, prince },
	);
	const page = await application.firstWindow();
	await page.getByRole('heading', { name: 'Cross-Doc' }).waitFor();
	const gui = await page.evaluate(() => window.crossDoc.chooseProject());
	assert.equal(gui.ok, true, gui.error);
	const terminal = inspection();
	assert.equal(terminal.status, 0);
	const library = await loadProject({ project });
	assert.deepEqual(summaries(gui.value.entries), summaries(terminal.value.project.entries));
	assert.deepEqual(
		summaries(gui.value.entries),
		summaries(library.entries.map(({ slug, title, type }) => ({ slug, title, category: type }))),
	);
	assert.deepEqual(gui.value.categories, terminal.value.project.categories);
	assert.deepEqual(gui.value.themes, terminal.value.project.themes);
	assert.deepEqual(
		diagnostics(gui.value.diagnostics.items),
		diagnostics(terminal.value.diagnostics),
	);
	assert.equal((await page.evaluate(() => window.crossDoc.choosePrince())).ok, true);

	// Defaults stay application-specific.
	const defaultCli = command(['--prince_binary', prince]);
	assert.equal(defaultCli.status, 0, defaultCli.stderr);
	assert.ok(
		(await readFile(join(project, 'out', basename(project) + '.html'), 'utf8')).includes('Alice'),
	);
	const defaultGui = await page.evaluate(() => window.crossDoc.publish({}));
	assert.equal(defaultGui.ok, true, defaultGui.error);
	assert.equal(defaultGui.value.pdf, join(project, 'out/auto.pdf'));

	const settings = {
		baseName: 'out/parity',
		html: 'html/book Ω.html',
		pdf: 'pdf/book Ω.pdf',
		embeddedHtml: 'archive/book Ω.html',
	};
	assert.equal(
		(await page.evaluate((settings) => window.crossDoc.setOutputs(settings), settings)).ok,
		true,
	);
	const paths = {
		html: join(project, settings.html),
		pdf: join(project, settings.pdf),
		embedded: join(project, settings.embeddedHtml),
	};
	for (const include of [undefined, ['alice'], ['alice', 'bob']]) {
		const checked = command([
			'--check',
			'--json',
			...(include ? ['--include', include.join(',')] : []),
		]);
		assert.equal(checked.status, 0, checked.stderr);
		const expected = await loadProject({ project, ...(include ? { include } : {}) });
		assert.deepEqual(
			summaries(JSON.parse(checked.stdout).project.entries),
			summaries(expected.entries.map(({ slug, title, type }) => ({ slug, title, category: type }))),
		);
		assert.deepEqual(
			diagnostics(JSON.parse(checked.stdout).diagnostics),
			diagnostics(expected.diagnostics),
		);
		const result = command([
			'-t',
			'default',
			'-H',
			settings.html,
			'-P',
			settings.pdf,
			'-e',
			settings.embeddedHtml,
			'--prince_binary',
			prince,
			...(include ? ['-i', include.join(',')] : []),
		]);
		assert.equal(result.status, 0, result.stderr);
		assert.equal(result.stdout, '');
		const before = {
			html: await readFile(paths.html, 'utf8'),
			embedded: await readFile(paths.embedded, 'utf8'),
			pdf: await renderedPdf(paths.pdf),
		};
		const published = await page.evaluate((request) => window.crossDoc.publish(request), {
			theme: 'default',
			...(include ? { include } : {}),
		});
		assert.equal(published.ok, true, published.error);
		assert.deepEqual(
			diagnostics(published.value.diagnostics.items),
			diagnostics(expected.diagnostics),
		);
		assert.equal(await readFile(paths.html, 'utf8'), before.html);
		assert.equal(await readFile(paths.embedded, 'utf8'), before.embedded);
		assert.deepEqual(await renderedPdf(paths.pdf), before.pdf);
		if (realPdf) assert.equal(published.value.preview.ok, true);
	}

	// Existing output remains unchanged for invalid selection and a removed entry.
	const retained = await readFile(paths.html, 'utf8');
	for (const include of [['unknown'], ['alice', 'unknown']]) {
		assert.equal(command(['--check', '--json', '-i', include.join(',')]).status, 1);
		assert.equal(
			(await page.evaluate((include) => window.crossDoc.publish({ include }), include)).ok,
			false,
		);
		assert.equal(await readFile(paths.html, 'utf8'), retained);
	}
	await rm(join(project, 'data/bob.md'));
	assert.equal(command(['--check', '--json', '-i', 'bob']).status, 1);
	assert.equal(
		(await page.evaluate(() => window.crossDoc.publish({ include: ['bob'] }))).ok,
		false,
	);
	assert.equal(await readFile(paths.html, 'utf8'), retained);
	await cp(new URL('fixtures/project/data/bob.md', import.meta.url), join(project, 'data/bob.md'));
	assert.equal((await page.evaluate(() => window.crossDoc.refresh())).ok, true);

	const categories = await readFile(join(project, 'data/categories.json'), 'utf8');
	for (const value of ['{bad', null]) {
		if (value === null) await rm(join(project, 'data/categories.json'));
		else await writeFile(join(project, 'data/categories.json'), value);
		assert.equal(inspection().status, 1);
		assert.equal((await page.evaluate(() => window.crossDoc.refresh())).ok, false);
	}
	await writeFile(join(project, 'data/categories.json'), categories);
	assert.equal((await page.evaluate(() => window.crossDoc.refresh())).ok, true);
	await rm(join(project, 'templates/A5'), { recursive: true });
	assert.deepEqual(inspection().value.project.themes, ['default']);
	const nonA5 = await page.evaluate(() => window.crossDoc.refresh());
	assert.deepEqual(nonA5.value.themes, ['default']);
	const fallback = await page.evaluate(() => window.crossDoc.publish({}));
	assert.equal(fallback.ok, true, fallback.error);
	assert.equal(command(['--prince_binary', prince]).status, 1, 'CLI retains its strict A5 default');
	await rm(join(project, 'templates/default'), { recursive: true });
	assert.deepEqual(inspection().value.project.themes, []);
	assert.deepEqual((await page.evaluate(() => window.crossDoc.refresh())).value.themes, []);
	assert.equal((await page.evaluate(() => window.crossDoc.publish({}))).ok, false);

	await cp(new URL('fixtures/project/templates/', import.meta.url), join(project, 'templates'), {
		recursive: true,
	});
	assert.equal((await page.evaluate(() => window.crossDoc.refresh())).ok, true);
	// Select a disposable executable before removing it; never alter the real Prince binary.
	await application.evaluate(({ dialog }, fake) => {
		dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [fake] });
	}, fake);
	assert.equal((await page.evaluate(() => window.crossDoc.choosePrince())).ok, true);
	await rm(fake);
	const missing = command(['-t', 'default', '--prince_binary', fake]);
	assert.equal(missing.status, 1);
	assert.equal(missing.stdout, '');
	const beforeMissing = await readFile(paths.html, 'utf8');
	const missingGui = await page.evaluate(() => window.crossDoc.publish({ theme: 'default' }));
	assert.equal(missingGui.ok, false);
	assert.match(missingGui.error, /Prince executable is unavailable/);
	assert.equal(
		await readFile(paths.html, 'utf8'),
		beforeMissing,
		'GUI preflight leaves existing output intact',
	);

	await writeFile(
		fake,
		`#!/usr/bin/env node
require('node:fs').writeFileSync(process.argv[process.argv.indexOf('-o')+1],'partial-pdf');
process.exitCode=4;
`,
		{ mode: 0o755 },
	);
	const beforePartial = await readFile(paths.embedded, 'utf8');
	const partial = command([
		'-t',
		'default',
		'-H',
		settings.html,
		'-P',
		settings.pdf,
		'-e',
		settings.embeddedHtml,
		'--prince_binary',
		fake,
	]);
	assert.equal(partial.status, 1);
	assert.equal(partial.stdout, '');
	assert.equal(await readFile(paths.pdf, 'utf8'), 'partial-pdf');
	const partialGui = await page.evaluate(() => window.crossDoc.publish({ theme: 'default' }));
	assert.equal(partialGui.ok, false);
	assert.equal(partialGui.artifacts.find((item) => item.kind === 'pdf').status, 'unverified');
	assert.equal(await readFile(paths.pdf, 'utf8'), 'partial-pdf');
	assert.equal(await readFile(paths.embedded, 'utf8'), beforePartial);

	console.log(
		'CLI / actual Electron parity: summaries, diagnostics, all/subset output, defaults, stale selection, malformed/missing categories, theme policies, missing Prince and partial output passed' +
			(realPdf ? '; real Prince PDF text/pages and preview matched.' : '.'),
	);
} finally {
	if (application) await application.close();
	await rm(temporary, { recursive: true, force: true });
}
