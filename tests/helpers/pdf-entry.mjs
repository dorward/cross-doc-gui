import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { app, BrowserWindow, dialog, shell } from 'electron';

app.setPath('userData', process.env.CROSS_DOC_GUI_TEST_DATA);
dialog.showOpenDialog = async (_window, options) => ({
	canceled: false,
	filePaths: [
		options.properties.includes('openFile')
			? process.env.CROSS_DOC_PRINCE_BINARY
			: process.env.CROSS_DOC_GUI_TEST_PROJECT,
	],
});
let root;
let preview;
app.on('browser-window-created', (_event, window) => {
	if (root) {
		preview = window;
		return;
	}
	root = window;
	window.webContents.once('did-finish-load', async () => {
		try {
			const configured = await root.webContents.executeJavaScript('window.crossDoc.choosePrince()');
			assert.equal(configured.ok, true, configured.error);
			const opened = await root.webContents.executeJavaScript('window.crossDoc.chooseProject()');
			assert.equal(opened.ok, true, opened.error);
			const published = await root.webContents.executeJavaScript('window.crossDoc.publish({})');
			assert.equal(published.ok, true, published.error);
			assert.deepEqual(published.value.preview, { ok: true });
			assert.ok(preview && !preview.isDestroyed());
			const preferences = preview.webContents.getLastWebPreferences();
			assert.equal(preferences.sandbox, true);
			assert.equal(preferences.contextIsolation, true);
			assert.equal(preferences.nodeIntegration, false);
			assert.ok(!preferences.preload);
			const isolation = await preview.webContents.executeJavaScript(
				'({ bridge: typeof window.crossDoc, node: typeof require })',
			);
			assert.deepEqual(isolation, { bridge: 'undefined', node: 'undefined' });
			await new Promise((resolve) => setTimeout(resolve, 800));
			const frames = preview.webContents.mainFrame.framesInSubtree;
			console.log(
				'PDF viewer frames:',
				frames.map((frame) => frame.url),
			);
			assert.ok(
				frames.some((frame) => frame.url.startsWith('chrome-extension://')),
				'built-in PDF viewer extension must load',
			);
			await writeFile(
				join(process.env.CROSS_DOC_GUI_TEST_DATA, 'viewer.png'),
				(await preview.webContents.capturePage()).toPNG(),
			);
			assert.equal(BrowserWindow.getAllWindows().length, 2);
			let warning = null;
			let revealed = null;
			dialog.showMessageBox = async (_parent, options) => {
				warning = options.message;
				return { response: 0, checkboxChecked: false };
			};
			shell.showItemInFolder = (path) => {
				revealed = path;
			};
			const closed = new Promise((resolve) => preview.once('closed', resolve));
			preview.webContents.forcefullyCrashRenderer();
			await closed;
			assert.match(warning, /PDF is still saved/);
			assert.equal(
				(await root.webContents.executeJavaScript('window.crossDoc.revealPdf()')).ok,
				true,
			);
			assert.equal(revealed, published.value.pdf);

			console.log(
				'Real PDF preview: isolated native BrowserWindow with built-in PDF viewer loaded.',
			);
			app.exit(0);
		} catch (error) {
			console.error(error);
			app.exit(1);
		}
	});
});
await import('../../dist/main/index.js');
