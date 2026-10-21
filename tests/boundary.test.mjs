// @vitest-environment node
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { CompilerWorker } from '../src/main/worker.ts';
import { ProjectSession } from '../src/main/session.ts';
import { authorizeSender, noArguments } from '../src/main/security.ts';
import { decodePublish, decodeSnapshot, MAX_ENTRIES } from '../src/shared/validation.ts';
import { decodeJob } from '../src/utility/protocol.ts';

const project = fileURLToPath(new URL('fixtures/project', import.meta.url));
const snapshot = {
	themes: ['A5', 'default'],
	project,
	entries: [{ slug: 'alice', title: 'Alice', category: 'person' }],
	categories: [{ id: 'person', heading: 'People' }],
};
const deferred = () => {
	let resolve;
	const promise = new Promise((done) => {
		resolve = done;
	});
	return { promise, resolve };
};

class Child extends EventEmitter {
	jobs = [];
	postMessage(job) {
		this.jobs.push(job);
	}
	kill = vi.fn(() => {
		this.emit('exit', 0);
		return true;
	});
	ready() {
		this.emit('message', { ready: true });
	}
	reply(value = snapshot) {
		this.emit('message', { id: this.jobs[0].id, result: { ok: true, value } });
	}
}

describe('validated messages', () => {
	it.each([
		null,
		[],
		{ project: '/etc' },
		{ theme: '../outside' },
		{ theme: '/tmp' },
		{ theme: 'a\\b' },
		{ theme: '' },
		{ include: [] },
		{ include: ['unknown'] },
		{ include: ['alice', 'alice'] },
		{ include: ['x'.repeat(4097)] },
		{ include: Array(MAX_ENTRIES + 1).fill('alice') },
	])('rejects malformed, excessive or unauthorized selections: %j', (value) => {
		expect(() => decodePublish(value, new Set(['alice']))).toThrow();
	});
	it('permits only the intended operations and complete summary shapes', () => {
		expect(decodePublish({}, new Set(['alice']))).toEqual({});
		expect(decodePublish({ include: ['alice'] }, new Set(['alice']))).toEqual({
			include: ['alice'],
		});
		expect(() =>
			decodeSnapshot({ ...snapshot, entries: [{ ...snapshot.entries[0], html: '<script>' }] }),
		).toThrow();
		expect(() =>
			decodeSnapshot({ ...snapshot, entries: [snapshot.entries[0], snapshot.entries[0]] }),
		).toThrow();
		expect(() => decodeJob({ id: '1', kind: 'exec', project })).toThrow();
		expect(() => decodeJob({ id: '1', kind: 'refresh', project: '../relative' })).toThrow();
	});
	it('bounds aggregate request and summary sizes', () => {
		expect(() =>
			decodePublish({
				include: Array.from({ length: 200 }, (_, index) => `${index}-${'a'.repeat(4000)}`),
			}),
		).toThrow('size');
		expect(() =>
			decodeSnapshot({
				...snapshot,
				entries: Array.from({ length: 2000 }, (_, index) => ({
					slug: `slug-${index}`,
					title: 'a'.repeat(4000),
					category: 'person',
				})),
			}),
		).toThrow('size');
	});
	it('requires exact window, frame and document identity', () => {
		const expected = { contents: {}, frame: {}, url: 'file:///app/index.html' };
		expect(() => authorizeSender(expected, expected)).not.toThrow();
		for (const change of [
			{ contents: {} },
			{ frame: {} },
			{ url: 'file:///another.html' },
			{ url: 'https://example.com' },
		]) {
			expect(() => authorizeSender({ ...expected, ...change }, expected)).toThrow();
		}
		expect(() => noArguments(['/arbitrary/path'])).toThrow();
	});
});

describe('compiler process lifecycle', () => {
	it('waits for readiness, correlates responses and rejects concurrent work', async () => {
		const child = new Child();
		const worker = new CompilerWorker(() => child);
		const job = worker.refresh(project);
		expect(child.jobs).toEqual([]);
		await expect(worker.refresh(project)).rejects.toThrow('busy');
		child.ready();
		expect(child.jobs[0].project).toBe(project);
		child.reply();
		await expect(job).resolves.toEqual(snapshot);
		expect(child.kill).toHaveBeenCalledOnce();
	});
	it('waits for exit before releasing the slot and ignores late messages', async () => {
		const child = new Child();
		child.kill.mockImplementation(() => true);
		const worker = new CompilerWorker(() => child);
		const job = worker.refresh(project);
		child.ready();
		child.reply();
		await expect(worker.refresh(project)).rejects.toThrow('busy');
		child.emit('exit', 0);
		await expect(job).resolves.toEqual(snapshot);
		child.emit('message', { id: 'late' });
	});
	it('rejects abnormal exits and allows a fresh-process retry', async () => {
		const children = [];
		const worker = new CompilerWorker(() => {
			const child = new Child();
			children.push(child);
			return child;
		});
		const first = worker.refresh(project);
		children[0].emit('exit', 7);
		await expect(first).rejects.toThrow('unexpectedly (7)');
		const retry = worker.refresh(project);
		children[1].ready();
		children[1].reply();
		await expect(retry).resolves.toEqual(snapshot);
	});
	it('rejects a startup exception and malformed or mismatched results', async () => {
		await expect(
			new CompilerWorker(() => {
				throw new Error('fork failed');
			}).refresh(project),
		).rejects.toThrow('fork failed');
		for (const message of [
			null,
			{ ready: false },
			{ id: 'wrong', result: { ok: true, value: snapshot } },
		]) {
			const child = new Child();
			const worker = new CompilerWorker(() => child);
			const job = worker.refresh(project);
			child.ready();
			child.emit('message', message);
			await expect(job).rejects.toThrow('Invalid compiler');
		}
	});
	it('propagates compiler errors', async () => {
		const child = new Child();
		const worker = new CompilerWorker(() => child);
		const job = worker.refresh(project);
		child.ready();
		child.emit('message', { id: child.jobs[0].id, result: { ok: false, error: 'Invalid YAML' } });
		await expect(job).rejects.toThrow('Invalid YAML');
	});
	it('handles fatal worker errors without throwing in main', async () => {
		const child = new Child();
		const worker = new CompilerWorker(() => child);
		const job = worker.refresh(project);
		child.emit('error', 'FatalError', 'location', 'report');
		await expect(job).rejects.toThrow('Compiler failed');
	});
	it('bounds a failed process termination and prevents overlap afterwards', async () => {
		vi.useFakeTimers();
		try {
			const child = new Child();
			child.kill.mockReturnValue(false);
			const worker = new CompilerWorker(() => child, 50);
			const job = worker.refresh(project);
			const failure = expect(job).rejects.toThrow('did not stop');
			await vi.advanceTimersByTimeAsync(2050);
			await failure;
			await expect(worker.refresh(project)).rejects.toThrow('closed');
			child.emit('exit', 1);
		} finally {
			vi.useRealTimers();
		}
	});
	it('times out before startup and rejects pending work on close', async () => {
		vi.useFakeTimers();
		try {
			const child = new Child();
			const worker = new CompilerWorker(() => child, 50);
			const job = worker.refresh(project);
			const failure = expect(job).rejects.toThrow('timed out');
			await vi.advanceTimersByTimeAsync(50);
			await failure;
			const pending = worker.refresh(project);
			worker.stop();
			await expect(pending).rejects.toThrow('closed');
			await expect(worker.refresh(project)).rejects.toThrow('closed');
		} finally {
			vi.useRealTimers();
		}
	});
});

function sessionSetup() {
	const compiler = {
		refresh: vi.fn().mockResolvedValue(snapshot),
		publish: vi.fn().mockResolvedValue({ pdf: `${project}/out/auto.pdf` }),
		stop: vi.fn(),
	};
	const choose = vi.fn().mockResolvedValue(project);
	const services = {
		princeBinary: vi.fn().mockResolvedValue('/test/prince'),
		choosePrince: vi.fn().mockResolvedValue(null),
		preview: vi.fn().mockResolvedValue(undefined),
		reveal: vi.fn().mockResolvedValue(undefined),
		closePreview: vi.fn(),
		dispose: vi.fn(),
	};
	return { compiler, choose, services, session: new ProjectSession(compiler, choose, services) };
}
describe('main-owned project session', () => {
	it('keeps compilation success separate from preview failure and reveals only its saved path', async () => {
		const { session, services } = sessionSetup();
		await expect(session.revealPdf()).rejects.toThrow('Publish');
		await session.choose();
		services.preview.mockRejectedValueOnce(new Error('Viewer unavailable'));
		await expect(session.publish({})).resolves.toEqual({
			pdf: `${project}/out/auto.pdf`,
			preview: { ok: false, error: 'Viewer unavailable' },
		});
		await session.revealPdf();
		expect(services.reveal).toHaveBeenCalledWith(`${project}/out/auto.pdf`);
		await session.choose();
		await expect(session.revealPdf()).rejects.toThrow('Publish');
	});
	it('passes main-owned executable settings and reports partial output on renderer failure', async () => {
		const { session, compiler, services } = sessionSetup();
		await expect(session.choosePrince()).resolves.toBeNull();
		await session.choose();
		services.princeBinary.mockResolvedValueOnce('/custom/Prince binary');
		compiler.publish.mockRejectedValueOnce(new Error('renderer stopped'));
		await expect(session.publish({})).rejects.toThrow('partial HTML/CSS/PDF');
		expect(compiler.publish).toHaveBeenCalledWith(
			project,
			{ theme: 'A5' },
			'/custom/Prince binary',
			expect.objectContaining({ pdf: `${project}/out/auto.pdf` }),
			expect.any(Function),
		);
		await expect(session.revealPdf()).rejects.toThrow('Publish');
	});

	it('rejects publish before opening and validates known slugs and output paths', async () => {
		const { session, compiler } = sessionSetup();
		await expect(session.publish({})).rejects.toThrow('Open');
		await session.choose();
		await expect(session.publish({ project: '/tmp' })).rejects.toThrow();
		await expect(session.publish({ include: ['person'] })).rejects.toThrow();
		await expect(session.publish({ theme: 'not-a-project-theme' })).rejects.toThrow(
			'supported project theme',
		);
		expect(compiler.publish).not.toHaveBeenCalled();
		await session.publish({ include: ['alice'] });
		expect(compiler.publish).toHaveBeenCalledWith(
			project,
			{ theme: 'A5', include: ['alice'] },
			'/test/prince',
			{
				html: `${project}/out/auto.html`,
				pdf: `${project}/out/auto.pdf`,
				embeddedHtml: `${project}/out/auto-complete.html`,
			},
			expect.any(Function),
		);
		compiler.publish.mockResolvedValueOnce({ pdf: '/tmp/wrong.pdf' });
		await expect(session.publish({})).rejects.toThrow('unexpected output');
	});
	it('keeps a cancelled or failed open from replacing the selected project', async () => {
		const { session, choose, compiler } = sessionSetup();
		await session.choose();
		choose.mockResolvedValueOnce(null);
		await expect(session.choose()).resolves.toBeNull();
		choose.mockResolvedValueOnce('/definitely/missing');
		await expect(session.choose()).rejects.toThrow();
		await session.publish({});
		expect(compiler.publish).toHaveBeenCalledWith(
			project,
			{ theme: 'A5' },
			'/test/prince',
			{
				html: `${project}/out/auto.html`,
				pdf: `${project}/out/auto.pdf`,
				embeddedHtml: `${project}/out/auto-complete.html`,
			},
			expect.any(Function),
		);
	});
	it('requires a successful refresh after refresh failure', async () => {
		const { session, compiler } = sessionSetup();
		await session.choose();
		compiler.refresh.mockRejectedValueOnce(new Error('Missing input'));
		await expect(session.refresh()).rejects.toThrow('Missing input');
		await expect(session.publish({})).rejects.toThrow('Refresh');
		await session.refresh();
		await expect(session.publish({})).resolves.toMatchObject({ pdf: `${project}/out/auto.pdf` });
	});
	it('does not accept old results after session close and rejects overlapping jobs', async () => {
		const { session, compiler } = sessionSetup();
		const pending = deferred();
		compiler.refresh.mockReturnValueOnce(pending.promise);
		const opening = session.choose();
		await vi.waitFor(() => expect(compiler.refresh).toHaveBeenCalled());
		await expect(session.choose()).rejects.toThrow('already running');
		session.close();
		pending.resolve(snapshot);
		await expect(opening).rejects.toThrow('closed');
		expect(compiler.stop).toHaveBeenCalled();
		await expect(session.refresh()).rejects.toThrow('closed');
	});
});

describe('bounded diagnostics', () => {
	it('projects oversized reports with an explicit omitted count and validates both success protocols', async () => {
		const { projectDiagnostics, decodeDiagnostics, MAX_DIAGNOSTIC_BYTES } =
			await import('../src/shared/diagnostics.ts');
		const { decodeFiles, decodePublished } = await import('../src/shared/validation.ts');
		const warning = {
			code: 'missing-link-target',
			severity: 'warning',
			source: 'alice',
			target: 'missing',
		};
		const report = projectDiagnostics(Array.from({ length: 10000 }, () => warning));
		expect(report.items.length).toBeLessThanOrEqual(1000);
		expect(report.items.length + report.omitted).toBe(10000);
		expect(Buffer.byteLength(JSON.stringify(report))).toBeLessThan(MAX_DIAGNOSTIC_BYTES);
		expect(decodeSnapshot({ ...snapshot, diagnostics: report }).diagnostics).toEqual(report);
		expect(decodeFiles({ pdf: '/out.pdf', diagnostics: report }).diagnostics).toEqual(report);
		expect(
			decodePublished({ pdf: '/out.pdf', preview: { ok: true }, diagnostics: report }).diagnostics,
		).toEqual(report);
		for (const invalid of [
			{ items: Array(1001).fill(warning), omitted: 0 },
			{ items: [{ ...warning, code: 'arbitrary' }], omitted: 0 },
			{ items: [{ ...warning, source: 'x'.repeat(4097) }], omitted: 0 },
			{ items: Array(1000).fill({ ...warning, source: 'x'.repeat(4096) }), omitted: 0 },
			{ items: [], omitted: -1 },
			{ items: [], omitted: Infinity },
			{ items: [{ ...warning, html: '<script>' }], omitted: 0 },
		])
			expect(() => decodeDiagnostics(invalid)).toThrow();
		expect(projectDiagnostics([{ ...warning, source: 'x'.repeat(4097) }])).toEqual({
			items: [],
			omitted: 1,
		});
	});
	it('preserves validated warnings through worker failure and session wrapping', async () => {
		const child = new Child();
		const worker = new CompilerWorker(() => child);
		const report = {
			items: [
				{ code: 'missing-link-target', severity: 'warning', source: 'alice', target: 'missing' },
			],
			omitted: 0,
		};
		const pending = worker.refresh(project);
		child.ready();
		child.emit('message', {
			id: child.jobs[0].id,
			result: { ok: false, error: 'Broken categories', diagnostics: report },
		});
		await expect(pending).rejects.toMatchObject({
			message: 'Broken categories',
			diagnostics: report,
		});
	});
});

describe('artifact and progress transport', () => {
	it('bounds and validates artifact fields', async () => {
		const { decodeArtifacts, stageSequence, stages } = await import('../src/shared/compilation.ts');
		const artifact = { kind: 'html', path: '/book.html', status: 'completed' };
		expect(decodeArtifacts([artifact])).toEqual([artifact]);
		for (const invalid of [
			[artifact, artifact],
			Array(5).fill(artifact),
			[{ ...artifact, kind: 'other' }],
			[{ ...artifact, status: 'created' }],
			[{ ...artifact, path: 'x'.repeat(4097) }],
			[{ ...artifact, html: 'raw' }],
		])
			expect(() => decodeArtifacts(invalid)).toThrow();
		const sequence = stageSequence();
		for (const stage of stages)
			for (const status of ['started', 'completed'])
				expect(sequence({ stage, status })).toEqual({ stage, status });
		expect(() => sequence({ stage: 'output', status: 'completed' })).toThrow();
		expect(() => stageSequence()({ stage: 'output', status: 'started' })).toThrow();
	});
	it('forwards ordered current-job progress, ignores stale jobs and stops after response', async () => {
		const child = new Child();
		const worker = new CompilerWorker(() => child);
		const progress = vi.fn();
		const pending = worker.publish(
			project,
			{},
			'/test/prince',
			{ html: '/book.html', pdf: '/book.pdf', embeddedHtml: '/complete.html' },
			progress,
		);
		child.ready();
		const id = child.jobs[0].id;
		child.emit('message', { id: 'stale', progress: { stage: 'output', status: 'started' } });
		child.emit('message', { id, progress: { stage: 'discover', status: 'started' } });
		expect(progress).toHaveBeenCalledExactlyOnceWith({ stage: 'discover', status: 'started' });
		child.reply({ pdf: '/book.pdf', artifacts: [] });
		await pending;
		child.emit('message', { id, progress: { stage: 'discover', status: 'completed' } });
		expect(progress).toHaveBeenCalledTimes(1);
	});
	it('rejects repeated or malformed current-job progress and preserves worker cancellation', async () => {
		for (const event of [
			{ stage: 'unknown', status: 'started' },
			{ stage: 'discover', status: 'started' },
		]) {
			const child = new Child();
			const worker = new CompilerWorker(() => child);
			const pending = worker.publish(project, {}, '/test/prince', {
				html: '/book.html',
				pdf: '/book.pdf',
				embeddedHtml: '/complete.html',
			});
			child.ready();
			const id = child.jobs[0].id;
			child.emit('message', { id, progress: { stage: 'discover', status: 'started' } });
			child.emit('message', { id, progress: event });
			await expect(pending).rejects.toThrow('progress');
			expect(child.kill).toHaveBeenCalledOnce();
		}
	});
	it('retains validated artifact facts on worker failure', async () => {
		const child = new Child();
		const worker = new CompilerWorker(() => child);
		const pending = worker.publish(project, {}, '/test/prince', {
			html: '/book.html',
			pdf: '/book.pdf',
			embeddedHtml: '/complete.html',
		});
		child.ready();
		const artifacts = [{ kind: 'html', path: '/book.html', status: 'unverified' }];
		child.emit('message', {
			id: child.jobs[0].id,
			result: { ok: false, error: 'Prince failed', artifacts },
		});
		await expect(pending).rejects.toMatchObject({ artifacts });
	});
	it('rejects unknown artifact paths and noncompleted successful reports', async () => {
		const { session, compiler } = sessionSetup();
		await session.choose();
		compiler.publish.mockRejectedValueOnce(
			Object.assign(new Error('failed'), {
				artifacts: [{ kind: 'html', path: '/arbitrary', status: 'completed' }],
			}),
		);
		await expect(session.publish({})).rejects.toThrow('unexpected artifact path');
		await expect(session.revealArtifact('html')).rejects.toThrow('successfully');
		compiler.publish.mockResolvedValueOnce({
			pdf: project + '/out/auto.pdf',
			artifacts: [{ kind: 'pdf', path: project + '/out/auto.pdf', status: 'unverified' }],
		});
		await expect(session.publish({})).rejects.toThrow('did not complete');
	});
});
