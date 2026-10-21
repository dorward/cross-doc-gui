import { Appearance } from './appearance.js';
import { installHelpMenu } from './help.js';
import { artifactsFromError, operationId } from '../shared/compilation.js';
import { diagnosticsFromError } from '../shared/diagnostics.js';
import { app, BrowserWindow, dialog, ipcMain, utilityProcess, shell, nativeTheme } from 'electron';
import type { IpcMainInvokeEvent, UtilityProcess } from 'electron';
import { fileURLToPath } from 'node:url';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { PrinceConfiguration } from './prince.js';
import { PdfPreview } from './preview.js';
import { ProjectSession } from './session.js';
import { CompilerWorker } from './worker.js';
import { authorizeSender, noArguments } from './security.js';
import { errorMessage } from '../shared/validation.js';
import type { Result } from '../shared/api.js';

let renderer = new URL('../renderer/index.html', import.meta.url);
const developmentUrl = !app.isPackaged && process.env.CROSS_DOC_DEV_SERVER_URL;
if (developmentUrl) {
	const url = new URL(developmentUrl);
	if (
		url.protocol !== 'http:' ||
		url.hostname !== '127.0.0.1' ||
		!url.port ||
		url.pathname !== '/' ||
		url.search ||
		url.hash ||
		url.username ||
		url.password
	)
		throw new Error('Development renderer must use the local Vite server');
	renderer = url;
}
const windows = new Map<BrowserWindow, ProjectSession>();
const appearance = new Appearance(join(app.getPath('userData'), 'appearance.json'), (mode) => {
	nativeTheme.themeSource = mode;
});
// Keep this gate across renderer reloads and window replacements. A stopped
// session must not overlap its retiring worker with a new writer.
const workers = new Set<UtilityProcess>();
function forkCompiler(): UtilityProcess {
	if (workers.size) throw new Error('Previous compiler is still stopping. Please retry.');
	const child = utilityProcess.fork(
		fileURLToPath(new URL('../utility/index.js', import.meta.url)),
		[],
		{
			serviceName: 'Cross-Doc compiler',
			stdio: 'inherit',
		},
	);
	workers.add(child);
	child.once('exit', () => workers.delete(child));
	return child;
}

function createSession(window: BrowserWindow): ProjectSession {
	const preview = new PdfPreview(window);
	const configuration = new PrinceConfiguration(
		join(app.getPath('userData'), 'prince.json'),
		async () => {
			const result = await dialog.showOpenDialog(window, {
				title: 'Choose the Prince executable',
				properties: ['openFile'],
			});
			return result.canceled ? null : (result.filePaths[0] ?? null);
		},
	);
	return new ProjectSession(
		new CompilerWorker(forkCompiler),
		async () => {
			const choice = await dialog.showOpenDialog(window, { properties: ['openDirectory'] });
			return choice.canceled ? null : (choice.filePaths[0] ?? null);
		},
		{
			princeBinary: () => configuration.resolve(),
			choosePrince: () => configuration.chooseExecutable(),
			chooseOutput: async (kind, defaultPath) => {
				const result = await dialog.showSaveDialog(window, {
					title: `Choose ${kind === 'embeddedHtml' ? 'embedded HTML' : kind.toUpperCase()} output`,
					defaultPath,
					properties: ['showOverwriteConfirmation', 'createDirectory'],
				});
				return result.canceled ? null : (result.filePath ?? null);
			},
			preview: (pdf) => preview.show(pdf),
			reveal: async (pdf) => {
				if (!(await stat(pdf)).isFile())
					throw new Error('The generated PDF is no longer available');
				shell.showItemInFolder(pdf);
			},
			closePreview: () => preview.close(),
			dispose: () => preview.dispose(),
		},
	);
}

async function respond<T>(
	event: IpcMainInvokeEvent,
	action: (session: ProjectSession) => Promise<T>,
): Promise<Result<T>> {
	try {
		const window = BrowserWindow.fromWebContents(event.sender);
		if (!window || window.isDestroyed()) throw new Error('Application window is closed');
		authorizeSender(
			{ contents: event.sender, frame: event.senderFrame, url: event.senderFrame?.url ?? '' },
			{ contents: window.webContents, frame: window.webContents.mainFrame, url: renderer.href },
		);
		const session = windows.get(window);
		if (!session) throw new Error('Application session is closed');
		return { ok: true, value: await action(session) };
	} catch (error) {
		return {
			ok: false,
			error: errorMessage(error),
			...diagnosticsFromError(error),
			...artifactsFromError(error),
		};
	}
}

ipcMain.handle('appearance:get', (event, ...args: unknown[]) =>
	respond(event, async () => {
		noArguments(args);
		return appearance.get();
	}),
);
ipcMain.handle('appearance:set', (event, ...args: unknown[]) =>
	respond(event, async () => {
		if (args.length !== 1) throw new Error('Invalid appearance request');
		return appearance.set(args[0]);
	}),
);

ipcMain.handle('project:choose', (event, ...args: unknown[]) =>
	respond(event, (session) => {
		noArguments(args);
		return session.choose();
	}),
);
ipcMain.handle('project:refresh', (event, ...args: unknown[]) =>
	respond(event, (session) => {
		noArguments(args);
		return session.refresh();
	}),
);
ipcMain.handle('outputs:get', (event, ...args: unknown[]) =>
	respond(event, (session) => {
		noArguments(args);
		return session.getOutputs();
	}),
);
ipcMain.handle('outputs:set', (event, ...args: unknown[]) =>
	respond(event, (session) => {
		if (args.length !== 1) throw new Error('Invalid output settings request');
		return session.setOutputs(args[0]);
	}),
);
ipcMain.handle('outputs:choose', (event, ...args: unknown[]) =>
	respond(event, (session) => {
		if (args.length !== 1) throw new Error('Invalid output chooser request');
		return session.chooseOutput(args[0]);
	}),
);

ipcMain.handle('project:publish', (event, ...args: unknown[]) =>
	respond(event, (session) => {
		if (args.length !== 2 || !operationId(args[1])) throw new Error('Invalid publish arguments');
		const id = args[1];
		return session.publish(args[0], (progress) => {
			if (!event.sender.isDestroyed()) event.sender.send('publish:progress', { id, progress });
		});
	}),
);

ipcMain.handle('prince:get', (event, ...args: unknown[]) =>
	respond(event, (session) => {
		noArguments(args);
		return session.getPrince();
	}),
);
ipcMain.handle('prince:choose', (event, ...args: unknown[]) =>
	respond(event, (session) => {
		noArguments(args);
		return session.choosePrince();
	}),
);
ipcMain.handle('artifact:reveal', (event, ...args: unknown[]) =>
	respond(event, (session) => {
		if (args.length !== 1) throw new Error('Invalid artifact reveal request');
		return session.revealArtifact(args[0]);
	}),
);
ipcMain.handle('pdf:reveal', (event, ...args: unknown[]) =>
	respond(event, (session) => {
		noArguments(args);
		return session.revealPdf();
	}),
);

function createWindow(): void {
	const window = new BrowserWindow({
		width: 900,
		backgroundColor: nativeTheme.shouldUseDarkColors ? '#111827' : '#f9fafb',
		height: 700,
		webPreferences: {
			preload: fileURLToPath(new URL('../preload/index.cjs', import.meta.url)),
			nodeIntegration: false,
			contextIsolation: true,
			sandbox: true,
			webviewTag: false,
		},
	});
	windows.set(window, createSession(window));
	window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
	window.webContents.on('will-navigate', (event) => event.preventDefault());
	window.webContents.on('will-attach-webview', (event) => event.preventDefault());
	window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) =>
		callback(false),
	);
	window.webContents.session.setPermissionCheckHandler(() => false);
	const reset = () => {
		windows.get(window)?.close();
		windows.set(window, createSession(window));
	};
	window.webContents.on('did-start-navigation', (_event, _url, inPlace, mainFrame) => {
		if (mainFrame && !inPlace) reset();
	});
	window.webContents.on('render-process-gone', reset);
	window.on('closed', () => {
		windows.get(window)?.close();
		windows.delete(window);
	});
	const loaded = developmentUrl
		? window.loadURL(renderer.href)
		: window.loadFile(fileURLToPath(renderer));
	void loaded.catch((error: unknown) => {
		console.error(errorMessage(error));
		window.close();
	});
}

void app
	.whenReady()
	.then(async () => {
		await appearance.initialize();
		installHelpMenu();
		createWindow();
	})
	.catch((error: unknown) => {
		console.error(errorMessage(error));
		app.quit();
	});
app.on('before-quit', () => {
	for (const session of windows.values()) session.close();
});
app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
	if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
