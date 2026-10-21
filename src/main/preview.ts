import { BrowserWindow, dialog } from 'electron';
import { open } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export class PdfPreview {
	private window: BrowserWindow | null = null;
	private disposed = false;
	constructor(private readonly parent: BrowserWindow) {}

	dispose(): void {
		this.disposed = true;
		this.close();
	}

	close(): void {
		this.window?.destroy();
		this.window = null;
	}

	async show(filename: string): Promise<void> {
		this.close();
		const handle = await open(filename, 'r');
		try {
			const header = Buffer.alloc(5);
			await handle.read(header, 0, 5, 0);
			if (header.toString() !== '%PDF-')
				throw new Error('The generated file is not a readable PDF');
		} finally {
			await handle.close();
		}
		if (this.disposed || this.parent.isDestroyed()) throw new Error('Application window is closed');
		const url = pathToFileURL(filename).href;
		const window = new BrowserWindow({
			parent: this.parent,
			width: 900,
			height: 750,
			title: 'Cross-Doc PDF',
			show: false,
			webPreferences: {
				nodeIntegration: false,
				contextIsolation: true,
				sandbox: true,
				webviewTag: false,
				plugins: true,
				partition: 'cross-doc-pdf',
			},
		});
		this.window = window;
		window.on('closed', () => {
			if (this.window === window) this.window = null;
		});
		window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
		window.webContents.on('will-navigate', (event, target) => {
			if (target !== url && !target.startsWith(`${url}#`)) event.preventDefault();
		});
		window.webContents.on('will-attach-webview', (event) => event.preventDefault());
		const session = window.webContents.session;
		session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
		session.setPermissionCheckHandler(() => false);
		// Do not allow PDF links or embedded scripts to fetch network resources.
		session.webRequest.onBeforeRequest(
			{ urls: ['http://*/*', 'https://*/*', 'ftp://*/*', 'ws://*/*', 'wss://*/*'] },
			(_details, callback) => callback({ cancel: true }),
		);
		let loading = true;
		window.webContents.on('render-process-gone', () => {
			if (!loading && !this.parent.isDestroyed())
				void dialog
					.showMessageBox(this.parent, {
						type: 'warning',
						message: 'PDF preview stopped. The PDF is still saved.',
						detail: 'Use Reveal PDF in the main window to locate it.',
					})
					.catch(() => {
						/* Parent may close while the dialog is opening. */
					});
			if (!window.isDestroyed()) window.destroy();
		});
		let timer: ReturnType<typeof setTimeout> | undefined;
		try {
			await Promise.race([
				window.loadFile(filename),
				new Promise<never>((_resolve, reject) => {
					timer = setTimeout(() => reject(new Error('PDF preview timed out')), 10_000);
				}),
			]);
			if (this.window !== window || window.isDestroyed()) throw new Error('PDF preview was closed');
			window.show();
		} catch (error) {
			if (!window.isDestroyed()) window.destroy();
			throw error;
		} finally {
			clearTimeout(timer);
			loading = false;
		}
	}
}
