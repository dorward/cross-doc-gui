import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron } from 'playwright';
import electron from 'electron';
import { startDevelopment } from '../scripts/dev.mjs';

const profile = await mkdtemp(join(tmpdir(), 'gui-dev-test-'));
const appFile = new URL('../src/renderer/App.tsx', import.meta.url);
const mainFile = new URL('../src/main/index.ts', import.meta.url);
const originalApp = await readFile(appFile, 'utf8');
const originalMain = await readFile(mainFile, 'utf8');
const applications = [];
let development;
try {
	development = await startDevelopment({
		launch: async (env) => {
			const application = await _electron.launch({
				executablePath: electron,
				args: [new URL('../', import.meta.url).pathname, `--user-data-dir=${profile}`],
				env,
			});
			applications.push(application);
			return application.process();
		},
	});
	const application = applications[0];
	await application.evaluate(
		({ dialog }, project) => {
			dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [project] });
		},
		new URL('fixtures/project', import.meta.url).pathname,
	);
	const page = await application.firstWindow();
	page.on('pageerror', (error) => console.error(error));
	await page.getByRole('button', { name: 'Open', exact: true }).click();
	await page.getByText('Project loaded.', { exact: true }).waitFor();
	await page.getByRole('combobox', { name: 'Theme' }).selectOption('default');
	const originalPid = application.process().pid;
	await writeFile(
		appFile,
		originalApp.replace('<h1>Cross-Doc</h1>', '<h1>Cross-Doc HMR verified</h1>'),
	);
	await page.getByRole('heading', { name: 'Cross-Doc HMR verified', exact: true }).waitFor();
	assert.equal(application.process().pid, originalPid);
	assert.equal(await page.getByRole('combobox', { name: 'Theme' }).inputValue(), 'default');
	assert.equal(await page.getByRole('button', { name: 'Publish', exact: true }).isEnabled(), true);
	const prefs = await application.evaluate(({ BrowserWindow }) =>
		BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences(),
	);
	assert.equal(prefs.sandbox, true);
	assert.equal(prefs.contextIsolation, true);
	assert.equal(prefs.nodeIntegration, false);
	await writeFile(mainFile, originalMain + '\n// Development restart verification.\n');
	const timeout = Date.now() + 30000;
	while (applications.length < 2 && Date.now() < timeout)
		await new Promise((resolve) => setTimeout(resolve, 100));
	assert.equal(applications.length, 2, 'Node-side edit must restart Electron');
	assert.notEqual(applications[1].process().pid, originalPid);
	const next = await applications[1].firstWindow();
	await next.getByRole('heading', { name: 'Cross-Doc HMR verified', exact: true }).waitFor();
	assert.equal(await next.getByRole('button', { name: 'Publish', exact: true }).isDisabled(), true);
	console.log(
		'Development check passed: real React Fast Refresh preserves selection/project; Node edit restarts Electron; sandbox remains enabled.',
	);
} finally {
	await development?.close();
	await writeFile(appFile, originalApp);
	await writeFile(mainFile, originalMain);
	await rm(profile, { recursive: true, force: true });
}
