import assert from 'node:assert/strict';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, dialog, utilityProcess, shell, Menu } from 'electron';

app.setPath('userData', process.env.CROSS_DOC_GUI_TEST_DATA);
const fixture = process.env.CROSS_DOC_GUI_TEST_PROJECT;
let cancel = false;
let nextWorker = null;
const children = [];
const fork = utilityProcess.fork.bind(utilityProcess);
utilityProcess.fork = (path, args, options) => {
	const mode = nextWorker;
	nextWorker = null;
	const child = fork(
		mode === 'slow' ? fileURLToPath(new URL('slow-worker.mjs', import.meta.url)) : path,
		args,
		options,
	);
	children.push(child);
	if (mode === 'crash') child.once('spawn', () => child.kill());
	return child;
};
let primary = false;
dialog.showOpenDialog = async (_window, options) => ({
	canceled: cancel,
	filePaths: cancel
		? []
		: [
				options.properties.includes('openFile')
					? join(process.env.CROSS_DOC_GUI_TEST_DATA, 'bin', 'prince')
					: fixture,
			],
});
let revealed = null;
shell.showItemInFolder = (path) => {
	revealed = path;
};
app.on('browser-window-created', (_event, window) => {
	if (primary) return;
	primary = true;
	window.webContents.on('preload-error', (_event, path, error) => {
		console.error(`Preload failed: ${path}`, error);
		app.exit(1);
	});
	window.webContents.once('did-finish-load', async () => {
		try {
			const packageMetadata = JSON.parse(
				await readFile(new URL('../../package.json', import.meta.url), 'utf8'),
			);
			const helpMenu = Menu.getApplicationMenu().items.find((item) => item.role === 'help');
			assert.ok(helpMenu);
			const originalMessageBox = dialog.showMessageBox;
			const helpDialogs = [];
			dialog.showMessageBox = async (...args) => {
				helpDialogs.push(args.at(-1));
				return { response: 0, checkboxChecked: false };
			};
			try {
				for (const label of [
					'Cross-Doc Help',
					'About Cross-Doc',
					'Project warnings',
					'Output destinations',
					'Publishing and recovery',
				]) {
					const item = helpMenu.submenu.items.find((item) => item.label === label);
					assert.ok(item);
					item.click(item, window, {});
				}
				assert.match(helpDialogs[0].detail, /No themes disables publishing/);
				assert.match(helpDialogs[4].detail, /output is not atomic/);
				assert.ok(helpDialogs[1].detail.includes('Version ' + packageMetadata.version));
				assert.equal(children.length, 0, 'Help/About must not start the compiler');
			} finally {
				dialog.showMessageBox = originalMessageBox;
			}
			const preferences = window.webContents.getLastWebPreferences();
			assert.equal(preferences.sandbox, true);
			assert.equal(preferences.contextIsolation, true);
			assert.equal(preferences.nodeIntegration, false);
			const result = await window.webContents.executeJavaScript(`(async () => {
				// React's initial render may follow did-finish-load.
				await new Promise((resolve, reject) => {
					const timer = setTimeout(() => reject(new Error('React did not mount')), 5000);
					const check = () => {
						if (document.querySelector('h1')) { clearTimeout(timer); resolve(); }
						else requestAnimationFrame(check);
					};
					check();
				});
				const unopened = await window.crossDoc.refresh();
				const opened = await window.crossDoc.chooseProject();
				const refreshed = await window.crossDoc.refresh();
				return {
					title: document.querySelector('h1').textContent,
					require: typeof require,
					process: typeof process,
					methods: Object.keys(window.crossDoc).sort(),
					buttons: [...document.querySelectorAll('button')].map((button) => ({ label: button.textContent.trim(), disabled: button.disabled })),
					styles: [...document.styleSheets].length,
					unopened, opened, refreshed,
				};
			})()`);
			assert.equal(result.title, 'Cross-Doc');
			assert.equal(result.require, 'undefined');
			assert.equal(result.process, 'undefined');
			assert.deepEqual(result.methods, [
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
			]);
			assert.deepEqual(
				result.buttons.map(({ label }) => label),
				['Open', 'Refresh', 'Publish', ''],
			);
			assert.equal(result.buttons[1].disabled, true);
			assert.ok(result.styles > 0);
			assert.equal(result.unopened.ok, false);
			assert.equal(result.opened.ok, true);
			assert.equal(result.opened.value.project, fixture);
			assert.equal(result.refreshed.ok, true);
			assert.equal(result.refreshed.value.entries.length, 4);
			assert.ok(
				result.refreshed.value.entries.every(
					(entry) => Object.keys(entry).sort().join() === 'category,slug,title',
				),
			);
			cancel = true;
			assert.deepEqual(
				await window.webContents.executeJavaScript('window.crossDoc.chooseProject()'),
				{ ok: true, value: null },
			);
			cancel = false;
			const ui = await window.webContents.executeJavaScript(`(async () => {
				document.querySelector('button[aria-label="Open"]').click();
				await new Promise((resolve, reject) => {
					const timeout = setTimeout(() => reject(new Error('Open did not update React state')), 5000);
					const check = () => {
						if (document.querySelector('[role="tree"]')) { clearTimeout(timeout); resolve(); }
						else requestAnimationFrame(check);
					};
					check();
				});
				return {
					project: document.querySelector('.project-path').textContent,
					publishDisabled: document.querySelector('button[aria-label="Publish"]').disabled,
					categories: [...document.querySelectorAll('[role="treeitem"]')].map((item) => item.getAttribute('aria-label')),
				};
			})()`);
			assert.equal(ui.project, fixture);
			assert.equal(ui.publishDisabled, false);
			assert.deepEqual(ui.categories, ['People', 'Events']);
			assert.ok(children.length >= 3, 'real refreshes fork compiler utility processes');
			for (const value of [
				{ include: [] },
				{ include: ['person'] },
				{ include: ['alice', 'alice'] },
				{ project: '/tmp' },
				{ include: ['x'.repeat(4097)] },
			]) {
				const failure = await window.webContents.executeJavaScript(
					`window.crossDoc.publish(${JSON.stringify(value)})`,
				);
				assert.equal(failure.ok, false);
			}
			const published = await window.webContents.executeJavaScript(`(async()=>{
				const progress=[];
				const result=await window.crossDoc.publish({},event=>progress.push(event));
				return {...result,progress};
			})()`);
			assert.equal(published.progress.length, 24);
			assert.deepEqual(published.progress[0], { stage: 'discover', status: 'started' });
			assert.deepEqual(published.progress.at(-1), { stage: 'output', status: 'completed' });
			assert.equal(published.value.artifacts.length, 4);
			assert.ok(published.value.artifacts.every((item) => item.status === 'completed'));
			assert.equal(
				(await window.webContents.executeJavaScript('window.crossDoc.revealArtifact("html")')).ok,
				true,
			);
			assert.equal(revealed, join(fixture, 'out/auto.html'));
			assert.equal(
				(await window.webContents.executeJavaScript('window.crossDoc.revealArtifact("css")')).ok,
				false,
			);
			assert.equal(published.ok, true, published.error);
			assert.equal(
				published.value.preview.ok,
				false,
				'fake PDF marker must not be reported as a working preview',
			);
			assert.equal(
				(await window.webContents.executeJavaScript('window.crossDoc.revealPdf()')).ok,
				true,
			);
			assert.equal(revealed, published.value.pdf);
			const configured = await window.webContents.executeJavaScript(
				'window.crossDoc.choosePrince()',
			);
			assert.equal(configured.ok, true);
			assert.equal(
				JSON.parse(await readFile(join(process.env.CROSS_DOC_GUI_TEST_DATA, 'prince.json'), 'utf8'))
					.binary,
				configured.value,
			);

			assert.equal(published.value.pdf, join(fixture, 'out', 'auto.pdf'));
			assert.match(await readFile(join(fixture, 'out', 'auto.html'), 'utf8'), /id="alice"/);
			assert.match(
				await readFile(join(fixture, 'out', 'auto-complete.html'), 'utf8'),
				/data:image\/svg\+xml;base64/,
			);
			assert.equal(await readFile(published.value.pdf, 'utf8'), 'fake-pdf-process-fixture');
			const subset = await window.webContents.executeJavaScript(
				'window.crossDoc.publish({include:["bob"]})',
			);
			assert.equal(subset.ok, true, subset.error);
			assert.deepEqual(subset.value.diagnostics, {
				items: [
					{ code: 'missing-link-target', severity: 'warning', source: 'bob', target: 'alice' },
				],
				omitted: 0,
			});
			const html = await readFile(join(fixture, 'out', 'auto.html'), 'utf8');
			assert.match(html, /id="bob"/);
			assert.doesNotMatch(html, /id="alice"/);

			const settings = {
				baseName: 'reports/My book Ω',
				html: 'html/custom.html',
				pdf: '',
				embeddedHtml: 'archive/complete.html',
			};
			assert.equal(
				(
					await window.webContents.executeJavaScript(
						`window.crossDoc.setOutputs(${JSON.stringify(settings)})`,
					)
				).ok,
				true,
			);
			const externalPdf = join(process.env.CROSS_DOC_GUI_TEST_DATA, 'Native Ω.pdf');
			assert.equal(
				(
					await window.webContents.executeJavaScript(
						`window.crossDoc.setOutputs(${JSON.stringify({ ...settings, pdf: externalPdf })})`,
					)
				).ok,
				false,
			);
			dialog.showSaveDialog = async () => ({ canceled: true });
			assert.deepEqual(
				await window.webContents.executeJavaScript('window.crossDoc.chooseOutput("pdf")'),
				{ ok: true, value: null },
			);
			dialog.showSaveDialog = async (_window, options) => {
				assert.ok(options.properties.includes('showOverwriteConfirmation'));
				assert.equal(options.defaultPath, join(fixture, 'reports/My book Ω.pdf'));
				return { canceled: false, filePath: externalPdf };
			};
			assert.equal(
				(await window.webContents.executeJavaScript('window.crossDoc.chooseOutput("pdf")')).ok,
				true,
			);
			assert.equal(
				(await window.webContents.executeJavaScript('window.crossDoc.refresh()')).ok,
				true,
			);
			const custom = await window.webContents.executeJavaScript(
				'window.crossDoc.publish({include:["bob"]})',
			);
			assert.equal(custom.ok, true, custom.error);
			assert.equal(custom.value.pdf, externalPdf);
			assert.match(await readFile(join(fixture, 'html/custom.html'), 'utf8'), /id="bob"/);
			assert.match(
				await readFile(join(fixture, 'archive/complete.html'), 'utf8'),
				/data:text\/css;base64/,
			);
			assert.equal(await readFile(externalPdf, 'utf8'), 'fake-pdf-process-fixture');
			assert.equal(
				(await window.webContents.executeJavaScript('window.crossDoc.revealPdf()')).ok,
				true,
			);
			assert.equal(revealed, externalPdf);
			const failureFlag = join(process.env.CROSS_DOC_GUI_TEST_DATA, 'fail-prince');
			await writeFile(failureFlag, 'fail');
			const renderFailure = await window.webContents.executeJavaScript(
				'window.crossDoc.publish({include:["bob"]})',
			);
			assert.deepEqual(renderFailure.diagnostics, subset.value.diagnostics);
			assert.equal(renderFailure.ok, false);
			assert.equal(renderFailure.artifacts.length, 4);
			assert.equal(renderFailure.artifacts.find((item) => item.kind === 'css').status, 'completed');
			assert.ok(
				renderFailure.artifacts
					.filter((item) => item.kind !== 'css')
					.every((item) => item.status === 'unverified'),
			);
			assert.equal(
				(await window.webContents.executeJavaScript('window.crossDoc.revealArtifact("pdf")')).ok,
				false,
			);
			assert.match(renderFailure.error, /Fake renderer failure/);
			await rm(failureFlag);
			// Exercise actual worker death through the production controller, then retry.
			nextWorker = 'crash';
			const failure = await window.webContents.executeJavaScript('window.crossDoc.refresh()');
			assert.equal(failure.ok, false);
			assert.match(failure.error, /exited unexpectedly/);
			const recovered = await window.webContents.executeJavaScript('window.crossDoc.refresh()');
			assert.equal(recovered.ok, true);
			let heartbeats = 0;
			const heartbeat = setInterval(() => {
				heartbeats++;
			}, 10);
			nextWorker = 'slow';
			const simultaneous = await window.webContents.executeJavaScript(
				'Promise.all([window.crossDoc.refresh(), window.crossDoc.refresh()])',
			);
			clearInterval(heartbeat);
			assert.equal(simultaneous[0].ok, true);
			assert.equal(simultaneous[1].ok, false);
			assert.match(simultaneous[1].error, /already running/);
			assert.ok(heartbeats >= 10, 'main remains responsive while compiler process is CPU-bound');
			// A sandboxed unrelated window with its own test-only IPC probe is unauthorized.
			const attacker = new BrowserWindow({
				show: false,
				webPreferences: {
					preload: fileURLToPath(new URL('attack-preload.cjs', import.meta.url)),
					sandbox: true,
					contextIsolation: true,
					nodeIntegration: false,
				},
			});
			await attacker.loadURL('data:text/html,<html><body>Unrelated window</body></html>');
			const denied = await attacker.webContents.executeJavaScript('window.probe.refresh()');
			assert.equal(denied.ok, false);
			assert.match(denied.error, /Unknown application|session is closed/);
			attacker.destroy();
			nextWorker = 'slow';
			const before = children.length;
			const interrupted = window.webContents
				.executeJavaScript('window.crossDoc.refresh()')
				.catch(() => null);
			await new Promise((resolve, reject) => {
				const timeout = setTimeout(() => reject(new Error('No pending worker')), 3000);
				const check = () => {
					if (children.length > before) {
						clearTimeout(timeout);
						resolve();
					} else setTimeout(check, 5);
				};
				check();
			});
			const retired = new Promise((resolve) => children.at(-1).once('exit', resolve));
			// A document reload invalidates the selected project and kills old work.
			const reloaded = new Promise((resolve) =>
				window.webContents.once('did-finish-load', resolve),
			);
			window.webContents.reload();
			await reloaded;
			await retired;
			await interrupted;
			const reset = await window.webContents.executeJavaScript('window.crossDoc.refresh()');
			assert.equal(reset.ok, false);
			assert.match(reset.error, /Open a project/);
			console.log(
				`Electron ${process.versions.electron} / Node ${process.versions.node}: compiled ESM entry, isolated preload, React/assets and utility fixture refresh, crash recovery, bounded concurrency, main responsiveness, IPC rejection and reload cleanup passed`,
			);
			app.exit(0);
		} catch (error) {
			console.error(error);
			app.exit(1);
		}
	});
});
await import('../../dist/main/index.js');
