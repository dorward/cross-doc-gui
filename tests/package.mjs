import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractFile, listPackage } from '@electron/asar';
import { _electron } from 'playwright';

const root = fileURLToPath(new URL('../', import.meta.url));
const temporary = await realpath(await mkdtemp(join(tmpdir(), 'gui-packaged-')));
let application;
let closed = false;
async function noEscapingLinks(directory, base = directory) {
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const path = join(directory, entry.name);
		if (entry.isSymbolicLink()) {
			const destination = relative(base, await realpath(path));
			assert.ok(
				destination !== '..' && !destination.startsWith('../') && !isAbsolute(destination),
				`External package link: ${path}`,
			);
		} else if (entry.isDirectory()) await noEscapingLinks(path, base);
	}
}
try {
	const relocated = join(temporary, 'Standalone app Ω');
	if (process.argv.includes('--zip')) {
		const maker = join(root, 'out/make/zip', process.platform, process.arch);
		const zip = (await readdir(maker)).filter((file) => file.endsWith('.zip'));
		assert.equal(zip.length, 1, 'one host ZIP distributable');
		await mkdir(relocated);
		execFileSync('unzip', ['-q', join(maker, zip[0]), '-d', relocated]);
	} else {
		await cp(join(root, 'out', `Cross-Doc-${process.platform}-${process.arch}`), relocated, {
			recursive: true,
			verbatimSymlinks: true,
		});
	}
	const bundle =
		process.platform === 'darwin' ? join(relocated, 'Cross-Doc.app/Contents') : relocated;
	const resources = join(bundle, process.platform === 'darwin' ? 'Resources' : 'resources');
	const archive = join(resources, 'app.asar');
	await noEscapingLinks(relocated);
	const files = listPackage(archive);
	assert.ok(
		files.includes('/dist/main/index.js') &&
			files.includes('/dist/utility/index.js') &&
			files.includes('/dist/preload/index.cjs'),
	);
	assert.ok(
		!files.some((file) => /^\/(?:src|tests|scripts|forge\.config)/.test(file)),
		'no development source/harness files shipped',
	);
	assert.ok(
		!files.some((file) =>
			/\/node_modules\/(?:typescript|vite|esbuild|oxlint|oxfmt|playwright|@electron-forge)(?:\/|$)/.test(
				file,
			),
		),
		'no build tools shipped',
	);
	assert.ok(
		!files.some((file) => file.startsWith('/node_modules/')),
		'ESM runtime dependencies must be outside ASAR',
	);
	assert.ok((await readdir(join(resources, 'node_modules'))).includes('cross-doc'));

	const manifest = JSON.parse(extractFile(archive, 'package.json').toString());
	assert.equal(manifest.type, 'module');
	assert.equal(
		manifest.dependencies['cross-doc'],
		JSON.parse(
			await readFile(new URL('../node_modules/cross-doc/package.json', import.meta.url), 'utf8'),
		).version,
	);
	assert.ok(
		!manifest.devDependencies && !manifest.scripts && !manifest.config && !manifest.packageManager,
	);
	const profile = join(temporary, 'profile');
	await mkdir(profile);
	// A stale saved choice must fail usefully even on machines with Prince installed.
	await writeFile(
		join(profile, 'prince.json'),
		JSON.stringify({ binary: join(temporary, 'missing-prince') }),
	);
	const project = join(temporary, 'Document project Ω');
	await cp(new URL('fixtures/project/', import.meta.url), project, { recursive: true });
	const fake = join(temporary, 'fake prince');
	await writeFile(
		fake,
		`#!/bin/sh
[ "$1" = '--no-network' ] || exit 10
if [ -f "$CROSS_DOC_PACKAGE_FAIL_FILE" ]; then printf 'Fake Prince failed' >&2; exit 7; fi
printf 'fake-pdf-process-fixture' > "$4"
`,
		{ mode: 0o755 },
	);
	const env = {
		...process.env,
		PATH: '/usr/bin:/bin',
		// Packaged apps must ignore an inherited development server setting.
		CROSS_DOC_DEV_SERVER_URL: 'http://127.0.0.1:9/',
		CROSS_DOC_PACKAGE_FAIL_FILE: join(temporary, 'fail-prince'),
	};
	for (const key of [
		'ELECTRON_RUN_AS_NODE',
		'NODE_PATH',
		'NODE_OPTIONS',
		'PNPM_HOME',
		'npm_execpath',
	])
		delete env[key];
	application = await _electron.launch({
		executablePath: join(
			bundle,
			process.platform === 'darwin' ? 'MacOS/cross-doc-gui' : 'cross-doc-gui',
		),
		args: [`--user-data-dir=${profile}`],
		cwd: temporary,
		env,
		timeout: 30000,
	});
	application.process().stderr?.on('data', (data) => process.stderr.write(data));
	const runtime = await application.evaluate(({ app }) => ({
		packaged: app.isPackaged,
		path: app.getAppPath(),
		profile: app.getPath('userData'),
	}));
	assert.equal(runtime.packaged, true);
	assert.equal(runtime.path, archive);
	assert.equal(runtime.profile, profile);
	await application.evaluate(
		({ dialog, shell }, { project, fake }) => {
			dialog.showOpenDialog = async (_window, options) => ({
				canceled: false,
				filePaths: [options.properties.includes('openFile') ? fake : project],
			});
			shell.showItemInFolder = (path) => {
				globalThis.revealedPdf = path;
			};
		},
		{ project, fake },
	);
	let page = await application.firstWindow();
	await page.getByRole('heading', { name: 'Cross-Doc' }).waitFor();

	const aboutState = await application.evaluate(async ({ Menu, dialog, app }) => {
		const messages = [];
		const original = dialog.showMessageBox;
		dialog.showMessageBox = async (...args) => {
			messages.push(args.at(-1));
			return { response: 0, checkboxChecked: false };
		};
		try {
			const menu = Menu.getApplicationMenu().items.find((item) => item.role === 'help');
			for (const label of [
				'Cross-Doc Help',
				'About Cross-Doc',
				'Project warnings',
				'Output destinations',
				'Publishing and recovery',
			]) {
				const item = menu.submenu.items.find((item) => item.label === label);
				item.click(item, null, {});
			}
			return { version: app.getVersion(), messages };
		} finally {
			dialog.showMessageBox = original;
		}
	});
	assert.equal(
		aboutState.version,
		JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')).version,
	);
	assert.ok(aboutState.messages[1].detail.includes('Version ' + aboutState.version));
	assert.match(aboutState.messages[3].detail, /Settings → Output destinations/);
	assert.match(aboutState.messages[0].detail, /Install and license Prince separately/);
	assert.match(aboutState.messages[4].detail, /Preview failure is separate/);
	const isolation = await page.evaluate(() => ({
		node: typeof require,
		process: typeof process,
		methods: Object.keys(window.crossDoc).sort(),
	}));
	assert.deepEqual(isolation, {
		node: 'undefined',
		process: 'undefined',
		methods: [
			'chooseOutput',
			'choosePrince',
			'chooseProject',
			'getAppearance',
			'getOutputs',
			'getPrince',
			'publish',
			'refresh',
			'revealArtifact',
			'revealPdf',
			'setAppearance',
			'setOutputs',
		],
	});

	assert.deepEqual(await page.evaluate(() => window.crossDoc.getAppearance()), {
		ok: true,
		value: 'system',
	});
	await page.emulateMedia({ colorScheme: 'light' });
	await page.waitForFunction(() => document.documentElement.dataset.colorMode === 'light');
	await page.getByRole('button', { name: 'Settings', exact: true }).click();
	const colorMode = page.getByLabel('Color mode', { exact: true });
	assert.equal(await colorMode.inputValue(), 'system');
	const lightColors = await page.evaluate(() => ({
		body: getComputedStyle(document.body).backgroundColor,
		dialog: getComputedStyle(document.querySelector('.p-dialog-content')).backgroundColor,
		toolbar: getComputedStyle(document.querySelector('.project-toolbar')).backgroundColor,
	}));
	await colorMode.selectOption('dark');
	await page.waitForFunction(() => document.documentElement.dataset.colorMode === 'dark');
	assert.equal(await application.evaluate(({ nativeTheme }) => nativeTheme.themeSource), 'dark');
	const darkColors = await page.evaluate(async () => {
		await document.fonts.ready;
		return {
			body: getComputedStyle(document.body).backgroundColor,
			dialog: getComputedStyle(document.querySelector('.p-dialog-content')).backgroundColor,
			toolbar: getComputedStyle(document.querySelector('.project-toolbar')).backgroundColor,
			font: document.fonts.check('16px "Inter var"'),
		};
	});
	assert.notEqual(darkColors.body, lightColors.body);
	assert.notEqual(darkColors.dialog, lightColors.dialog);
	assert.notEqual(darkColors.toolbar, lightColors.toolbar);
	assert.equal(darkColors.font, true, 'packaged theme fonts must load');
	await page.emulateMedia({ colorScheme: 'dark' });
	await colorMode.selectOption('light');
	await page.waitForFunction(() => document.documentElement.dataset.colorMode === 'light');
	assert.equal(await application.evaluate(({ nativeTheme }) => nativeTheme.themeSource), 'light');
	await colorMode.selectOption('system');
	await page.waitForFunction(() => document.documentElement.dataset.colorMode === 'dark');
	await page.emulateMedia({ colorScheme: 'light' });
	await page.waitForFunction(() => document.documentElement.dataset.colorMode === 'light');
	await colorMode.selectOption('dark');
	await page.waitForFunction(() => document.documentElement.dataset.colorMode === 'dark');
	await page.reload();
	await page.getByRole('heading', { name: 'Cross-Doc' }).waitFor();
	await page.waitForFunction(() => document.documentElement.dataset.colorMode === 'dark');
	await page.getByRole('button', { name: 'Settings', exact: true }).click();
	assert.equal(await page.getByLabel('Color mode', { exact: true }).inputValue(), 'dark');

	await application.close();
	application = await _electron.launch({
		executablePath: join(
			bundle,
			process.platform === 'darwin' ? 'MacOS/cross-doc-gui' : 'cross-doc-gui',
		),
		args: ['--user-data-dir=' + profile],
		cwd: temporary,
		env,
		timeout: 30000,
	});
	await application.evaluate(
		({ dialog, shell }, { project, fake }) => {
			dialog.showOpenDialog = async (_window, options) => ({
				canceled: false,
				filePaths: [options.properties.includes('openFile') ? fake : project],
			});
			shell.showItemInFolder = (path) => {
				globalThis.revealedPdf = path;
			};
		},
		{ project, fake },
	);
	page = await application.firstWindow();
	await page.emulateMedia({ colorScheme: 'light' });
	await page.getByRole('heading', { name: 'Cross-Doc' }).waitFor();
	await page.waitForFunction(() => document.documentElement.dataset.colorMode === 'dark');
	assert.equal(await application.evaluate(({ nativeTheme }) => nativeTheme.themeSource), 'dark');
	await page.getByRole('button', { name: 'Settings', exact: true }).click();
	assert.equal(await page.getByLabel('Color mode', { exact: true }).inputValue(), 'dark');
	await page.getByLabel('Color mode', { exact: true }).selectOption('system');
	await page.waitForFunction(() => document.documentElement.dataset.colorMode === 'light');
	await page.getByRole('button', { name: 'Close', exact: true }).click();
	await page.getByRole('button', { name: 'Open', exact: true }).click();
	await page.waitForFunction(
		() =>
			document.querySelector('[role=alert]') ||
			document.querySelector('[role=status]')?.textContent === 'Project loaded.',
	);
	assert.equal(
		await page.locator('[role=alert]').count(),
		0,
		await page.locator('body').textContent(),
	);
	const picker = page.getByRole('combobox', { name: 'Theme' });
	assert.deepEqual(await picker.locator('option').allTextContents(), ['A5', 'default']);
	await picker.selectOption('default');
	const missing = await page.evaluate(() => window.crossDoc.publish({}));
	assert.equal(missing.ok, false);
	assert.match(missing.error, /Choose Prince/);
	await page.getByRole('img', { name: 'Settings need attention' }).waitFor();
	await page.getByRole('button', { name: 'Settings', exact: true }).click();
	await page.getByText(/Needs attention:/).waitFor();
	await page.getByRole('button', { name: 'Choose Prince' }).click();
	await page.getByRole('button', { name: 'Close', exact: true }).click();
	await page.getByText(`Prince configured: ${fake}`, { exact: true }).waitFor();
	await page.getByRole('img', { name: 'Settings need attention' }).waitFor({ state: 'detached' });
	await page.getByRole('button', { name: 'Refresh', exact: true }).click();
	await page.getByText('Project refreshed.', { exact: true }).waitFor();
	assert.equal(await picker.inputValue(), 'default');
	await page.getByRole('button', { name: 'Publish', exact: true }).click();
	await page.getByText(`Published ${join(project, 'out/auto.pdf')}`, { exact: true }).waitFor();
	assert.match(
		await readFile(join(project, 'out/auto-complete.html'), 'utf8'),
		/data:image\/svg\+xml;base64/,
	);
	assert.equal(
		await readFile(join(project, 'out/auto.html'), 'utf8'),
		await readFile(new URL('expected/document.html', import.meta.url), 'utf8'),
	);
	await page.getByRole('button', { name: 'Reveal PDF', exact: true }).click();
	await page.getByText('PDF revealed in your file manager.', { exact: true }).waitFor();
	assert.equal(
		await application.evaluate(() => globalThis.revealedPdf),
		join(project, 'out/auto.pdf'),
	);
	const subset = await page.evaluate(() => window.crossDoc.publish({ include: ['bob'] }));
	assert.equal(subset.ok, true, subset.error);
	const html = await readFile(join(project, 'out/auto.html'), 'utf8');
	assert.match(html, /id="bob"/);
	assert.doesNotMatch(html, /id="alice"/);

	await page.getByRole('button', { name: 'Settings', exact: true }).click();
	await page.getByLabel('Output basename', { exact: true }).fill('reports/My book Ω');
	await page.getByLabel('HTML override', { exact: true }).fill('html/custom.html');
	await page.getByLabel('Embedded HTML override', { exact: true }).fill('archive/complete.html');
	await page.getByRole('button', { name: 'Save output settings' }).click();
	await page.getByText('Output settings saved.', { exact: true }).waitFor();
	const customPdf = join(temporary, 'Native Ω.pdf');
	await application.evaluate(({ dialog }, filePath) => {
		dialog.showSaveDialog = async () => ({ canceled: false, filePath });
	}, customPdf);
	await page.getByRole('button', { name: 'Choose PDF output' }).click();
	await page.waitForFunction(
		(path) => document.querySelector('#output-pdf')?.value === path,
		customPdf,
	);
	await page.getByRole('button', { name: 'Close', exact: true }).click();
	await page.getByRole('button', { name: 'Refresh', exact: true }).click();
	await page.getByText('Project refreshed.', { exact: true }).waitFor();
	await page.getByRole('button', { name: 'Publish', exact: true }).click();
	await page.getByText('Published ' + customPdf, { exact: true }).waitFor();
	assert.equal(
		await page.getByRole('region', { name: 'Compilation artifacts' }).getByRole('row').count(),
		5,
	);
	assert.equal(await page.getByText('Completed', { exact: true }).count(), 4);
	await page.getByRole('button', { name: 'Reveal HTML artifact' }).click();
	await page.getByText('Document revealed in your file manager.', { exact: true }).waitFor();
	assert.equal(
		await application.evaluate(() => globalThis.revealedPdf),
		join(project, 'html/custom.html'),
	);
	assert.match(await readFile(join(project, 'html/custom.html'), 'utf8'), /id="alice"/);
	assert.match(
		await readFile(join(project, 'archive/complete.html'), 'utf8'),
		/data:image\/svg\+xml;base64/,
	);
	await page.getByRole('button', { name: 'Reveal PDF', exact: true }).click();
	await page.getByText('PDF revealed in your file manager.', { exact: true }).waitFor();
	assert.equal(await application.evaluate(() => globalThis.revealedPdf), customPdf);
	await writeFile(env.CROSS_DOC_PACKAGE_FAIL_FILE, 'fail');
	const failure = await page.evaluate(() => window.crossDoc.publish({}));
	assert.equal(failure.ok, false);
	assert.match(failure.error, /Fake Prince failed/);
	await rm(env.CROSS_DOC_PACKAGE_FAIL_FILE);
	if (process.argv.includes('--pdf')) {
		const { PrinceConfiguration, executable } = await import('../dist/main/prince.js');
		const binary = process.env.CROSS_DOC_PRINCE_BINARY
			? await executable(process.env.CROSS_DOC_PRINCE_BINARY)
			: await new PrinceConfiguration(join(temporary, 'lookup.json'), async () => null).resolve();
		await application.evaluate(({ dialog }, binary) => {
			dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [binary] });
		}, binary);
		assert.equal((await page.evaluate(() => window.crossDoc.choosePrince())).ok, true);
		const pdf = await page.evaluate(() => window.crossDoc.publish({}));
		assert.equal(pdf.ok, true, pdf.error);
		assert.deepEqual(pdf.value.preview, { ok: true });
		const previewState = await application.evaluate(({ BrowserWindow }) => {
			const preview = BrowserWindow.getAllWindows().find(
				(window) => !window.webContents.getURL().endsWith('index.html'),
			);
			const prefs = preview.webContents.getLastWebPreferences();
			return {
				sandbox: prefs.sandbox,
				isolation: prefs.contextIsolation,
				node: prefs.nodeIntegration,
				preload: prefs.preload,
			};
		});
		assert.equal(previewState.sandbox, true);
		assert.equal(previewState.isolation, true);
		assert.equal(previewState.node, false);
		assert.ok(!previewState.preload);
		assert.match(execFileSync('pdfinfo', [pdf.value.pdf], { encoding: 'utf8' }), /Pages:\s+4\b/);
		assert.match(execFileSync('pdftotext', [pdf.value.pdf, '-'], { encoding: 'utf8' }), /Courage/);
	}
	await rm(join(project, 'templates'), { recursive: true });
	await page.getByRole('button', { name: 'Refresh', exact: true }).click();
	await page.getByText('Project refreshed.', { exact: true }).waitFor();
	const warning = page.getByRole('img', { name: 'The project has no themes' });
	await warning.hover();
	await page.getByRole('tooltip').waitFor();
	assert.equal(await page.getByRole('button', { name: 'Publish', exact: true }).isDisabled(), true);
	const noTheme = await page.evaluate(() => window.crossDoc.publish({ theme: 'A5' }));
	assert.equal(noTheme.ok, false);
	assert.match(noTheme.error, /supported project theme/);
	if (process.platform === 'darwin') {
		await application.evaluate(({ BrowserWindow }) => {
			for (const window of BrowserWindow.getAllWindows()) window.close();
		});
		for (let attempt = 0; attempt < 100; attempt++) {
			if (
				await application.evaluate(
					({ BrowserWindow }) => BrowserWindow.getAllWindows().length === 0,
				)
			)
				break;
			await new Promise((resolve) => setTimeout(resolve, 25));
		}
		assert.equal(
			await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length),
			0,
		);
		const next = application.waitForEvent('window');
		await application.evaluate(({ app }) => app.emit('activate'));
		const reopened = await next;
		await reopened.getByRole('heading', { name: 'Cross-Doc' }).waitFor();
		assert.equal(
			await reopened.getByRole('button', { name: 'Refresh', exact: true }).isDisabled(),
			true,
		);
	} else {
		const exit = application.waitForEvent('close');
		await application.evaluate(({ BrowserWindow }) => {
			setTimeout(() => {
				for (const window of BrowserWindow.getAllWindows()) window.close();
			}, 0);
		});
		await exit;
		closed = true;
	}
	console.log(
		`Packaged ${process.platform}/${process.arch}: relocated ASAR app, standalone utility compilation, IPC isolation, missing/selected Prince, HTML baseline/subset/embedding, reveal and lifecycle passed${process.argv.includes('--pdf') ? '; real Prince PDF and preview passed' : ''}.`,
	);
} finally {
	if (application && !closed) await application.close();
	await rm(temporary, { recursive: true, force: true });
}
