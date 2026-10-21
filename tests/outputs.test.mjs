// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OutputConfiguration } from '../src/main/outputs.ts';
import { ProjectSession } from '../src/main/session.ts';
import { decodeOutputSettings, defaultOutputSettings } from '../src/shared/outputs.ts';
import { decodeJob } from '../src/utility/protocol.ts';

let directory, project, outputs;
beforeEach(async () => {
	directory = await realpath(await mkdtemp(join(tmpdir(), 'gui-outputs-')));
	project = join(directory, 'project Ω');
	await mkdir(project);
	outputs = new OutputConfiguration(project);
});
afterEach(async () => {
	await rm(directory, { recursive: true, force: true });
});
it('resolves defaults, a relative basename and independent overrides', async () => {
	expect(await outputs.paths()).toEqual({
		html: join(project, 'out/auto.html'),
		pdf: join(project, 'out/auto.pdf'),
		embeddedHtml: join(project, 'out/auto-complete.html'),
	});
	await outputs.save({
		...defaultOutputSettings(),
		baseName: 'reports/My book Ω',
		html: 'html/index.html',
		pdf: 'pdf/My book.pdf',
	});
	expect(await outputs.paths()).toEqual({
		html: join(project, 'html/index.html'),
		pdf: join(project, 'pdf/My book.pdf'),
		embeddedHtml: join(project, 'reports/My book Ω-complete.html'),
	});
});
it('rejects malformed/unapproved settings and keeps the previous configuration', async () => {
	const original = outputs.get();
	for (const invalid of [
		{},
		{ ...original, arbitrary: true },
		{ ...original, baseName: '' },
		{ ...original, baseName: '../escape' },
		{ ...original, baseName: directory },
		{ ...original, pdf: join(directory, 'external.pdf') },
		{ ...original, html: '../escape.html' },
		{ ...original, pdf: 'x'.repeat(4097) },
		{ ...original, pdf: 'bad\0path' },
		{ ...original, html: 'same', pdf: 'same' },
		{ ...original, html: 'templates/index.css' },
	]) {
		await expect(outputs.save(invalid)).rejects.toThrow();
		expect(outputs.get()).toEqual(original);
	}
	expect(() => decodeOutputSettings({ ...original, pdf: undefined })).toThrow();
});
it('accepts external destinations only for their native-authorized kind', async () => {
	const external = join(directory, 'External Ω.pdf');
	await outputs.choose('pdf', external);
	expect((await outputs.paths()).pdf).toBe(external);
	await outputs.save({ ...outputs.get(), baseName: 'reports/book' });
	await expect(outputs.save({ ...outputs.get(), html: external })).rejects.toThrow(
		'native save dialog',
	);
	await expect(
		outputs.save({ ...outputs.get(), pdf: join(directory, 'not-chosen.pdf') }),
	).rejects.toThrow('native save dialog');
	expect((await outputs.paths()).pdf).toBe(external);
});
it('checks symlink escapes again before publishing, including dangling links', async () => {
	await mkdir(join(project, 'reports'));
	await outputs.save({ ...defaultOutputSettings(), pdf: 'reports/book.pdf' });
	await rm(join(project, 'reports'), { recursive: true });
	await symlink(directory, join(project, 'reports'));
	await expect(outputs.paths()).rejects.toThrow('stay inside');
	await symlink(join(directory, 'missing.pdf'), join(project, 'dangling.pdf'));
	await expect(outputs.save({ ...defaultOutputSettings(), pdf: 'dangling.pdf' })).rejects.toThrow(
		'unresolved symbolic link',
	);
});
it('rejects destinations that alias another output through symlinks', async () => {
	await writeFile(join(project, 'book.html'), 'existing');
	await symlink(join(project, 'book.html'), join(project, 'alias.html'));
	await expect(
		outputs.save({ ...defaultOutputSettings(), html: 'book.html', embeddedHtml: 'alias.html' }),
	).rejects.toThrow('distinct');
});
function setupSession() {
	const snapshot = {
		project,
		entries: [{ slug: 'alice', title: 'Alice', category: 'person' }],
		categories: [{ id: 'person', heading: 'People' }],
		themes: ['A5'],
	};
	const compiler = {
		refresh: vi.fn().mockResolvedValue(snapshot),
		publish: vi
			.fn()
			.mockImplementation(async (_project, _request, _prince, paths) => ({ pdf: paths.pdf })),
		stop: vi.fn(),
	};
	const services = {
		princeBinary: vi.fn().mockResolvedValue('/test/prince'),
		choosePrince: vi.fn(),
		chooseOutput: vi.fn().mockResolvedValue(null),
		preview: vi.fn(),
		reveal: vi.fn(),
		closePreview: vi.fn(),
		dispose: vi.fn(),
	};
	const choose = vi.fn().mockResolvedValue(project);
	return {
		compiler,
		services,
		choose,
		snapshot,
		session: new ProjectSession(compiler, choose, services),
	};
}
it('keeps settings across refresh/cancel, follows the configured PDF, and resets on open', async () => {
	const { session, services, compiler, choose, snapshot } = setupSession();
	await session.choose();
	await session.setOutputs({ ...defaultOutputSettings(), baseName: 'reports/custom' });
	await session.refresh();
	expect((await session.getOutputs()).baseName).toBe('reports/custom');
	expect(await session.chooseOutput('pdf')).toBeNull();
	expect((await session.getOutputs()).pdf).toBe('');
	services.chooseOutput.mockResolvedValueOnce(join(directory, 'Native Ω.pdf'));
	await session.chooseOutput('pdf');
	await session.publish({ include: ['alice'] });
	expect(compiler.publish.mock.calls[0][3].pdf).toBe(join(directory, 'Native Ω.pdf'));
	expect(services.preview).toHaveBeenCalledWith(join(directory, 'Native Ω.pdf'));
	await session.revealPdf();
	expect(services.reveal).toHaveBeenCalledWith(join(directory, 'Native Ω.pdf'));
	await session.choose();
	expect((await session.getOutputs()).pdf).toBe(join(directory, 'Native Ω.pdf'));
	const another = join(directory, 'another');
	await mkdir(another);
	choose.mockResolvedValueOnce(another);
	compiler.refresh.mockResolvedValueOnce({ ...snapshot, project: another });
	await session.choose();
	expect(await session.getOutputs()).toEqual(defaultOutputSettings());
	await expect(session.publish({ outputs: { pdf: '/arbitrary' } })).rejects.toThrow();
});
it('rejects pending native selections after close and overlapping configuration changes', async () => {
	const { session, services } = setupSession();
	await session.choose();
	let finish;
	services.chooseOutput.mockImplementationOnce(
		() =>
			new Promise((resolve) => {
				finish = resolve;
			}),
	);
	const pending = session.chooseOutput('pdf');
	await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
	await expect(session.setOutputs(defaultOutputSettings())).rejects.toThrow('already running');
	session.close();
	finish(join(directory, 'late.pdf'));
	await expect(pending).rejects.toThrow('closed');
});
it('validates internal absolute paths independently of publish requests', () => {
	const job = {
		id: '1',
		kind: 'publish',
		project,
		request: {},
		princeBinary: '/test/prince',
		outputs: { html: '/out.html', pdf: '/out.pdf', embeddedHtml: '/embedded.html' },
	};
	expect(decodeJob(job).outputs).toEqual(job.outputs);
	expect(() => decodeJob({ ...job, outputs: { ...job.outputs, pdf: 'relative.pdf' } })).toThrow();
	expect(() => decodeJob({ ...job, outputs: { ...job.outputs, other: '/arbitrary' } })).toThrow();
});

it('reveals only main-owned completed documents and rechecks existence', async () => {
	const { session, compiler, services } = setupSession();
	await session.choose();
	const paths = {
		css: join(project, 'templates/index.css'),
		html: join(project, 'out/auto.html'),
		pdf: join(project, 'out/auto.pdf'),
		'embedded-html': join(project, 'out/auto-complete.html'),
	};
	await mkdir(join(project, 'out'));
	await writeFile(paths.html, 'completed HTML');
	const artifacts = Object.entries(paths).map(([kind, path]) => ({
		kind,
		path,
		status: kind === 'css' || kind === 'html' ? 'completed' : 'unverified',
	}));
	compiler.publish.mockRejectedValueOnce(Object.assign(new Error('partial PDF'), { artifacts }));
	await expect(session.publish({})).rejects.toMatchObject({ artifacts });
	await session.revealArtifact('html');
	expect(services.reveal).toHaveBeenCalledWith(paths.html);
	await expect(session.revealArtifact('pdf')).rejects.toThrow('successfully');
	await expect(session.revealArtifact('css')).rejects.toThrow('Invalid');
	await expect(session.revealArtifact('/arbitrary')).rejects.toThrow('Invalid');
	await rm(paths.html);
	await expect(session.revealArtifact('html')).rejects.toThrow();
	expect(services.reveal).toHaveBeenCalledTimes(1);
});
