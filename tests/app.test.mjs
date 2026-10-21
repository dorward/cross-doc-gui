import { createElement, StrictMode } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../src/renderer/App.tsx';

const snapshot = {
	themes: ['A5', 'default'],
	project: '/project',
	categories: [{ id: 'person', heading: 'People' }],
	entries: [
		{ slug: 'alice', title: 'Alice', category: 'person' },
		{ slug: 'bob', title: 'Bob', category: 'person' },
	],
};
const success = (value) => ({ ok: true, value });
function setup(prince = success('/usr/bin/prince'), colorMode = 'system') {
	const api = {
		getAppearance: vi.fn().mockResolvedValue(success(colorMode)),
		setAppearance: vi.fn().mockImplementation(async (mode) => success(mode)),
		revealArtifact: vi.fn().mockResolvedValue(success(null)),
		getOutputs: vi
			.fn()
			.mockResolvedValue(success({ baseName: 'out/auto', html: '', pdf: '', embeddedHtml: '' })),
		setOutputs: vi.fn().mockImplementation(async (value) => success(value)),
		chooseOutput: vi.fn().mockResolvedValue(success(null)),
		getPrince: vi.fn().mockResolvedValue(prince),
		chooseProject: vi.fn().mockResolvedValue(success(snapshot)),
		refresh: vi.fn().mockResolvedValue(success(snapshot)),
		choosePrince: vi.fn().mockResolvedValue(success('/usr/bin/prince')),
		revealPdf: vi.fn().mockResolvedValue(success(null)),
		publish: vi
			.fn()
			.mockResolvedValue(success({ pdf: '/project/out/auto.pdf', preview: { ok: true } })),
	};
	render(createElement(StrictMode, null, createElement(App, { api })));
	return api;
}
async function open() {
	fireEvent.click(screen.getByRole('button', { name: 'Open' }));
	await screen.findByText('Project loaded.');
}
async function expand() {
	fireEvent.click(within(screen.getByRole('treeitem', { name: 'People' })).getByRole('button'));
	await screen.findByText('Alice');
}

describe('typed React application', () => {
	it('keeps a successful publish visible when preview fails and offers a narrow reveal action', async () => {
		const api = setup();
		await open();
		api.publish.mockResolvedValueOnce(
			success({
				pdf: '/project/out/auto.pdf',
				preview: { ok: false, error: 'Viewer unavailable' },
			}),
		);
		fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
		await screen.findByText('Published /project/out/auto.pdf');
		expect((await screen.findByRole('alert')).textContent).toContain(
			'PDF saved, but preview failed',
		);
		fireEvent.click(screen.getByRole('button', { name: 'Reveal PDF' }));
		await waitFor(() => expect(api.revealPdf).toHaveBeenCalledWith());
	});
	it('configures Prince through a native chooser without sending executable paths', async () => {
		const api = setup();
		fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
		await screen.findByRole('dialog');
		await screen.findByText('/usr/bin/prince');
		expect(screen.queryByRole('img', { name: 'Settings need attention' })).toBeNull();
		fireEvent.click(screen.getByRole('button', { name: 'Choose Prince' }));
		await screen.findByText('Prince configured: /usr/bin/prince');
		expect(api.choosePrince).toHaveBeenCalledWith();
		api.choosePrince.mockResolvedValueOnce(success(null));
		fireEvent.click(screen.getByRole('button', { name: 'Choose Prince' }));
		await screen.findByText('Prince selection cancelled.');
	});

	it('marks missing Prince and clears attention after configuring it in Settings', async () => {
		const api = setup({ ok: false, error: 'Prince was not found on PATH.' });
		const settings = screen.getByRole('button', { name: 'Settings' });
		expect(settings.textContent.trim()).toBe('');
		expect(settings.querySelector('.pi-cog')).not.toBeNull();
		expect(screen.queryByRole('button', { name: 'Choose Prince' })).toBeNull();
		await screen.findByRole('img', { name: 'Settings need attention' });
		fireEvent.click(settings);
		await screen.findByText(/Needs attention:/);
		api.getPrince.mockResolvedValue(success('/custom/prince'));
		api.choosePrince.mockResolvedValue(success('/custom/prince'));
		fireEvent.click(screen.getByRole('button', { name: 'Choose Prince' }));
		await screen.findByText('/custom/prince');
		expect(screen.queryByRole('img', { name: 'Settings need attention' })).toBeNull();
	});

	it('ignores a pending result after the renderer unmounts', async () => {
		let complete;
		const api = {
			getAppearance: vi.fn().mockResolvedValue(success('system')),
			chooseProject: () =>
				new Promise((resolve) => {
					complete = resolve;
				}),
			getPrince: vi.fn().mockResolvedValue(success('/usr/bin/prince')),
			refresh: vi.fn(),
			publish: vi.fn(),
		};
		const old = render(createElement(StrictMode, null, createElement(App, { api })));
		fireEvent.click(screen.getByRole('button', { name: 'Open' }));
		old.unmount();
		setup();
		complete(success(snapshot));
		await waitFor(() =>
			expect(screen.getByRole('status').textContent).toBe('Open a project to begin.'),
		);
		expect(screen.queryByText('/project')).toBeNull();
	});

	it('starts empty and preserves an open project when the next chooser is cancelled', async () => {
		const api = setup();
		expect(screen.getByRole('button', { name: 'Publish' }).disabled).toBe(true);
		expect(screen.getByRole('button', { name: 'Refresh' }).disabled).toBe(true);
		await open();
		api.chooseProject.mockResolvedValueOnce(success(null));
		fireEvent.click(screen.getByRole('button', { name: 'Open' }));
		await screen.findByText('Open cancelled.');
		expect(screen.getByText('/project')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Publish' }).disabled).toBe(false);
	});
	it('publishes all with no include and only leaf slugs for a subset', async () => {
		const api = setup();
		await open();
		fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
		await screen.findByText('Published /project/out/auto.pdf');
		expect(api.publish).toHaveBeenLastCalledWith({ theme: 'A5' }, expect.any(Function));
		await expand();
		fireEvent.click(within(screen.getByRole('treeitem', { name: 'Alice' })).getByRole('checkbox'));
		fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
		await waitFor(() =>
			expect(api.publish).toHaveBeenLastCalledWith(
				{ theme: 'A5', include: ['bob'] },
				expect.any(Function),
			),
		);
	});
	it('publishes the chosen theme, retains it on refresh and resets it for a new project', async () => {
		const api = setup();
		await open();
		const themes = screen.getByRole('combobox', { name: 'Theme' });
		expect(themes.value).toBe('A5');
		fireEvent.change(themes, { target: { value: 'default' } });
		fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
		await screen.findByText('Project refreshed.');
		expect(themes.value).toBe('default');
		fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
		await waitFor(() =>
			expect(api.publish).toHaveBeenCalledWith({ theme: 'default' }, expect.any(Function)),
		);
		await screen.findByText('Published /project/out/auto.pdf');
		api.refresh.mockResolvedValueOnce(success({ ...snapshot, themes: ['A5'] }));
		fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
		await screen.findByText('Project refreshed.');
		expect(themes.value).toBe('A5');
		api.chooseProject.mockResolvedValueOnce(
			success({ ...snapshot, project: '/new', themes: ['Print'] }),
		);
		await open();
		expect(screen.getByRole('combobox', { name: 'Theme' }).value).toBe('Print');
	});
	it('shows a tooltip warning and disables Publish when the project has no themes', async () => {
		const api = setup();
		api.chooseProject.mockResolvedValueOnce(success({ ...snapshot, themes: [] }));
		await open();
		expect(screen.queryByRole('combobox', { name: 'Theme' })).toBeNull();
		const warning = screen.getByRole('img', { name: 'The project has no themes' });
		fireEvent.mouseEnter(warning);
		await screen.findByRole('tooltip');
		expect(screen.getByRole('button', { name: 'Publish' }).disabled).toBe(true);
	});

	it('disables empty selection and resets it when a new project opens', async () => {
		const api = setup();
		await open();
		fireEvent.click(within(screen.getByRole('treeitem', { name: 'People' })).getByRole('checkbox'));
		expect(screen.getByRole('button', { name: 'Publish' }).disabled).toBe(true);
		api.chooseProject.mockResolvedValueOnce(success({ ...snapshot, project: '/other' }));
		fireEvent.click(screen.getByRole('button', { name: 'Open' }));
		await screen.findByText('/other');
		expect(screen.getByRole('button', { name: 'Publish' }).disabled).toBe(false);
	});
	it('keeps old data after refresh failure and permits a successful retry', async () => {
		const api = setup();
		await open();
		api.refresh.mockResolvedValueOnce({ ok: false, error: 'Invalid categories' });
		fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
		await screen.findByRole('alert');
		expect(screen.getByText('/project')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Publish' }).disabled).toBe(true);
		fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
		await screen.findByText('Project refreshed.');
		expect(screen.queryByRole('alert')).toBeNull();
		expect(screen.getByRole('button', { name: 'Publish' }).disabled).toBe(false);
		expect(api.refresh).toHaveBeenCalledTimes(2);
	});
	it('blocks overlapping actions and displays rejected bridge errors', async () => {
		const api = setup();
		let reject;
		api.chooseProject.mockReturnValueOnce(
			new Promise((_resolve, fail) => {
				reject = fail;
			}),
		);
		fireEvent.click(screen.getByRole('button', { name: 'Open' }));
		expect(screen.getByRole('button', { name: 'Open' }).disabled).toBe(true);
		fireEvent.click(screen.getByRole('button', { name: 'Open' }));
		reject(new Error('Unable to read project'));
		await screen.findByText('Unable to read project');
		expect(api.chooseProject).toHaveBeenCalledTimes(1);
		expect(screen.getByRole('button', { name: 'Open' }).disabled).toBe(false);
	});
});

it('shows link warnings on open and failed publish, and replaces them after refresh', async () => {
	const api = setup();
	const diagnostics = {
		items: [
			{ code: 'missing-reciprocal-link', severity: 'warning', source: 'alice', target: 'bob' },
		],
		omitted: 2,
	};
	api.chooseProject.mockResolvedValueOnce(success({ ...snapshot, diagnostics }));
	await open();
	fireEvent.click(screen.getByText('Project warnings (3)'));
	expect(screen.getByText(/alice: missing reciprocal link from bob/)).toBeTruthy();
	expect(screen.getByText('2 further warnings omitted from this view.')).toBeTruthy();
	api.publish.mockResolvedValueOnce({
		ok: false,
		error: 'Prince failed',
		diagnostics: {
			items: [
				{ code: 'missing-link-target', severity: 'warning', source: 'alice', target: 'gone' },
			],
			omitted: 0,
		},
	});
	fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
	await screen.findByText('Prince failed');
	expect(screen.getByText(/alice: links to non-existent target gone/)).toBeTruthy();
	fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
	await screen.findByText('Project refreshed.');
	expect(screen.queryByLabelText('Project warnings')).toBeNull();
});

it('edits output settings and uses a native chooser without putting paths in publish requests', async () => {
	const api = setup();
	await open();
	fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
	const basename = await screen.findByLabelText('Output basename');
	fireEvent.change(basename, { target: { value: 'reports/My book Ω' } });
	fireEvent.change(screen.getByLabelText('HTML override'), {
		target: { value: 'html/index.html' },
	});
	expect(screen.getByRole('button', { name: 'Choose PDF output' }).disabled).toBe(true);
	fireEvent.click(screen.getByRole('button', { name: 'Save output settings' }));
	await waitFor(() =>
		expect(api.setOutputs).toHaveBeenCalledWith({
			baseName: 'reports/My book Ω',
			html: 'html/index.html',
			pdf: '',
			embeddedHtml: '',
		}),
	);
	await waitFor(() =>
		expect(screen.getByRole('button', { name: 'Choose PDF output' }).disabled).toBe(false),
	);
	api.chooseOutput.mockResolvedValueOnce(
		success({
			baseName: 'reports/My book Ω',
			html: 'html/index.html',
			pdf: '/chosen/My book.pdf',
			embeddedHtml: '',
		}),
	);
	fireEvent.click(screen.getByRole('button', { name: 'Choose PDF output' }));
	await waitFor(() =>
		expect(screen.getByLabelText('PDF override').value).toBe('/chosen/My book.pdf'),
	);
	expect(api.chooseOutput).toHaveBeenCalledWith('pdf');
	fireEvent.click(screen.getByRole('button', { name: 'Close' }));
	fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
	await waitFor(() =>
		expect(api.publish).toHaveBeenCalledWith({ theme: 'A5' }, expect.any(Function)),
	);
});

it('shows live stages, failed artifact facts and completed-document reveal controls', async () => {
	const api = setup();
	await open();
	let finish, progress;
	api.publish.mockImplementationOnce((_request, onProgress) => {
		progress = onProgress;
		return new Promise((resolve) => {
			finish = resolve;
		});
	});
	fireEvent.click(screen.getByRole('button', { name: 'Publish', exact: true }));
	await waitFor(() => expect(progress).toBeTypeOf('function'));
	const { act } = await import('@testing-library/react');
	await act(async () => progress({ stage: 'output', status: 'started' }));
	expect(screen.getByLabelText('Compilation stage').textContent).toContain(
		'Writing HTML, PDF and embedded HTML',
	);
	const artifacts = [
		{ kind: 'css', path: '/project/templates/index.css', status: 'completed' },
		{ kind: 'html', path: '/project/out/auto.html', status: 'unverified' },
		{ kind: 'pdf', path: '/project/out/auto.pdf', status: 'unverified' },
		{ kind: 'embedded-html', path: '/project/out/auto-complete.html', status: 'not-started' },
	];
	await act(async () => finish({ ok: false, error: 'Partial PDF', artifacts }));
	await screen.findByText('Partial PDF');
	expect(screen.getAllByText('Completion unverified')).toHaveLength(2);
	expect(screen.getByText('Not attempted')).toBeTruthy();
	expect(screen.getByRole('button', { name: 'Reveal HTML artifact' }).disabled).toBe(true);
	await act(async () => progress({ stage: 'output', status: 'completed' }));
	expect(screen.queryByLabelText('Compilation stage')).toBeNull();
	api.publish.mockResolvedValueOnce(
		success({
			pdf: '/project/out/auto.pdf',
			preview: { ok: false, error: 'Viewer unavailable' },
			artifacts: artifacts.map((item) => ({ ...item, status: 'completed' })),
		}),
	);
	fireEvent.click(screen.getByRole('button', { name: 'Publish', exact: true }));
	await screen.findByText(/PDF saved, but preview failed/);
	fireEvent.click(screen.getByRole('button', { name: 'Reveal HTML artifact' }));
	await waitFor(() => expect(api.revealArtifact).toHaveBeenCalledWith('html'));
});

it('defaults to System, tracks OS changes and preserves explicit appearance overrides', async () => {
	const { act } = await import('@testing-library/react');
	let dark = false;
	const listeners = new Set();
	const media = {
		get matches() {
			return dark;
		},
		addEventListener: (_name, fn) => listeners.add(fn),
		removeEventListener: (_name, fn) => listeners.delete(fn),
	};
	const originalMedia = window.matchMedia;
	window.matchMedia = vi.fn().mockReturnValue(media);
	try {
		const api = setup({ ok: false, error: 'Prince unavailable' });
		fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
		const select = await screen.findByLabelText('Color mode');
		await waitFor(() => expect(select.disabled).toBe(false));
		expect(select.value).toBe('system');
		expect(document.documentElement.dataset.colorMode).toBe('light');
		await act(async () => {
			dark = true;
			listeners.forEach((fn) => fn());
		});
		expect(document.documentElement.dataset.colorMode).toBe('dark');
		fireEvent.change(select, { target: { value: 'light' } });
		await waitFor(() => expect(select.value).toBe('light'));
		expect(document.documentElement.dataset.colorMode).toBe('light');
		await act(async () => {
			dark = false;
			listeners.forEach((fn) => fn());
			dark = true;
			listeners.forEach((fn) => fn());
		});
		expect(document.documentElement.dataset.colorMode).toBe('light');
		fireEvent.change(select, { target: { value: 'dark' } });
		await waitFor(() => expect(select.value).toBe('dark'));
		expect(api.setAppearance).toHaveBeenLastCalledWith('dark');
		expect(document.documentElement.dataset.colorMode).toBe('dark');
		fireEvent.change(select, { target: { value: 'system' } });
		await waitFor(() => expect(select.value).toBe('system'));
		expect(document.documentElement.dataset.colorMode).toBe('dark');
		expect(document.querySelectorAll('#cross-doc-appearance-theme')).toHaveLength(1);
		expect(api.chooseProject).not.toHaveBeenCalled();
	} finally {
		window.matchMedia = originalMedia;
	}
});
it('loads a saved mode and retains it with a visible error if saving fails', async () => {
	const api = setup(success('/usr/bin/prince'), 'dark');
	fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
	const select = await screen.findByLabelText('Color mode');
	await waitFor(() => expect(select.value).toBe('dark'));
	api.setAppearance.mockResolvedValueOnce({ ok: false, error: 'Cannot save appearance' });
	fireEvent.change(select, { target: { value: 'light' } });
	await screen.findByText('Cannot save appearance');
	expect(select.value).toBe('dark');
	expect(document.documentElement.dataset.colorMode).toBe('dark');
});
