import { app, BrowserWindow, dialog, Menu } from 'electron';
import type { MenuItemConstructorOptions, MessageBoxOptions } from 'electron';
import { readFileSync } from 'node:fs';

function applicationVersion(): string {
	const metadata: unknown = JSON.parse(
		readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
	);
	if (
		metadata === null ||
		typeof metadata !== 'object' ||
		!('version' in metadata) ||
		typeof metadata.version !== 'string' ||
		!/^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.+-]+)?$/.test(metadata.version) ||
		metadata.version.length > 128
	)
		throw new Error('Invalid application version metadata');
	return metadata.version;
}

function show(options: MessageBoxOptions): void {
	const window = BrowserWindow.getFocusedWindow();
	const result = window ? dialog.showMessageBox(window, options) : dialog.showMessageBox(options);
	void result.catch(() => {
		/* Closing a parent during a native dialog must not crash the app. */
	});
}

export function installHelpMenu(): void {
	const version = applicationVersion();
	app.setAboutPanelOptions({ applicationName: 'Cross-Doc', applicationVersion: version });
	const about: MenuItemConstructorOptions = {
		label: 'About Cross-Doc',
		click: () =>
			show({
				type: 'info',
				title: 'About Cross-Doc',
				message: 'Cross-Doc',
				buttons: ['Close'],
				detail: `Version ${version}\n\nCompile trusted Markdown projects into HTML, PDF and embedded HTML.\n\nPrince must be installed and licensed separately.\n\nCreated by David Dorward. ISC license.`,
			}),
	};

	const topic = (label: string, detail: string): MenuItemConstructorOptions => ({
		label,
		click: () => show({ type: 'info', title: label, message: label, buttons: ['Close'], detail }),
	});
	const help = topic(
		'Cross-Doc Help',
		[
			'Open a trusted project with Markdown entries (title/type front matter) under data/, data/categories.json, templates/index.html and templates/<theme>/index.scss. Referenced assets belong in resources/.',
			'Install and license Prince separately. The app searches PATH and standard macOS locations; use Settings → Choose Prince for another executable. A red dot means Prince needs attention.',
			'Select entries or category checkboxes, then choose a theme. A5 is preferred when available; otherwise the first theme is used. No themes disables publishing. Refresh reloads the project and reconciles selection.',
			'Use the other Help topics for warning meanings, output destinations and recovery. Project content, templates and Sass must be trusted.',
		].join('\n\n'),
	);
	const warnings = topic(
		'Project warnings',
		[
			'Warnings identify a missing link target, a missing reciprocal link, or a one-way exemption without a corresponding link.',
			'For selected publishing, a missing target may simply be outside the selection. Warnings do not block publishing. The warning list shows when further warnings were omitted.',
		].join('\n\n'),
	);
	const destinations = topic(
		'Output destinations',
		[
			'Settings → Output destinations controls the basename and independent HTML, PDF and embedded-HTML overrides. Defaults use out/auto.',
			'Relative paths use the project directory. Use Choose file for external destinations, and save edits before choosing files.',
			'Settings survive refresh, reset on project change, and are not saved across app restarts or renderer reloads.',
		].join('\n\n'),
	);
	const recovery = topic(
		'Publishing and recovery',
		[
			'Publish generates all three documents and shows compilation stages. Output files reports Completed, Not attempted or Completion unverified for each write phase. Completed does not mean newly created. Reveal locates completed documents.',
			'A failed publish can leave old or partial CSS/HTML/PDF files: output is not atomic and is not rolled back. Correct the error and retry. A failed refresh needs a successful refresh before publishing.',
			'Preview failure is separate from compilation success; completed files remain available through Reveal.',
		].join('\n\n'),
	);
	const template: MenuItemConstructorOptions[] = [
		...(process.platform === 'darwin'
			? [
					{
						role: 'appMenu' as const,
						submenu: [
							about,
							{ type: 'separator' as const },
							{ role: 'services' as const },
							{ type: 'separator' as const },
							{ role: 'hide' as const },
							{ role: 'hideOthers' as const },
							{ role: 'unhide' as const },
							{ type: 'separator' as const },
							{ role: 'quit' as const },
						],
					},
				]
			: []),
		{ label: 'File', submenu: [{ role: process.platform === 'darwin' ? 'close' : 'quit' }] },
		{ role: 'editMenu' },
		{ role: 'viewMenu' },
		{ role: 'windowMenu' },
		{
			role: 'help',
			submenu: [help, warnings, destinations, recovery, { type: 'separator' }, about],
		},
	];
	Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
