import { compileProject } from 'cross-doc';
// @vitest-environment node
import { cp, mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { publishProject, refreshProject } from '../src/utility/compiler.ts';

let directory, project, prince;
beforeEach(async () => {
	directory = await realpath(await mkdtemp(join(tmpdir(), 'gui-compiler-')));
	project = join(directory, 'project Ω');
	await cp(new URL('fixtures/project/', import.meta.url), project, { recursive: true });
	prince = join(directory, 'fake prince');
	await writeFile(
		prince,
		`#!/usr/bin/env node
const fs = require('node:fs');
if (!process.argv.includes('--no-network')) throw new Error('Network must be disabled');
fs.writeFileSync(process.argv[process.argv.indexOf('-o') + 1], 'fake-pdf');
`,
		{ mode: 0o755 },
	);
});
afterEach(async () => {
	await rm(directory, { recursive: true, force: true });
});

describe('GUI compiler adapter', () => {
	it.skipIf(process.env.CROSS_DOC_TEST_TIMEOUT !== '1')(
		'propagates the real Prince timeout',
		async () => {
			await writeFile(prince, '#!/usr/bin/env node\nsetInterval(() => {}, 1000);\n', {
				mode: 0o755,
			});
			await expect(publishProject(project, {}, prince)).rejects.toThrow();
		},
		35000,
	);

	it('matches the reviewed sibling HTML baseline and embeds local assets', async () => {
		await publishProject(project, {}, prince);
		expect(await readFile(join(project, 'out/auto.html'), 'utf8')).toBe(
			await readFile(new URL('expected/document.html', import.meta.url), 'utf8'),
		);
		expect(await readFile(join(project, 'out/auto-complete.html'), 'utf8')).toContain(
			'data:image/svg+xml;base64,',
		);
		expect(await readFile(join(project, 'out/auto.pdf'), 'utf8')).toBe('fake-pdf');
	});
	it.each([
		['bad YAML', 'data/alice.md', '---\ntitle: [\n---\n# Broken', /YAML|parse|flow|line/i],
		['invalid metadata', 'data/alice.md', '---\ntitle: 123\ntype: person\n---\n# Broken', /title/i],
		['invalid categories', 'data/categories.json', '{bad', /categor|JSON/i],
	])('rejects %s', async (_label, filename, contents, message) => {
		await writeFile(join(project, filename), contents);
		await expect(refreshProject(project)).rejects.toThrow(message);
	});
	it('discovers only compilable theme directories and uses the selected stylesheet', async () => {
		await mkdir(join(project, 'templates', 'not-a-theme'));
		expect((await refreshProject(project)).themes).toEqual(['A5', 'default']);
		await writeFile(join(project, 'templates/default/index.scss'), 'body { color: #abcdef; }');
		await publishProject(project, { theme: 'default' }, prince);
		expect(await readFile(join(project, 'templates/index.css'), 'utf8')).toContain('#abcdef');
		await expect(publishProject(project, { theme: '../outside' }, prince)).rejects.toThrow(
			'unavailable',
		);
		await rm(join(project, 'templates'), { recursive: true });
		expect((await refreshProject(project)).themes).toEqual([]);
	});

	it('rejects missing input, themes, assets and unwritable output', async () => {
		await expect(refreshProject(join(project, 'absent'))).rejects.toThrow();
		await rm(join(project, 'templates/A5'), { recursive: true });
		await expect(publishProject(project, {}, prince)).rejects.toThrow();
		await cp(
			new URL('fixtures/project/templates/A5/', import.meta.url),
			join(project, 'templates/A5'),
			{ recursive: true },
		);
		await rm(join(project, 'resources/map.svg'));
		await expect(publishProject(project, {}, prince)).rejects.toThrow('map.svg');
		await cp(
			new URL('fixtures/project/resources/map.svg', import.meta.url),
			join(project, 'resources/map.svg'),
		);
		await rm(join(project, 'out'), { recursive: true, force: true });
		await writeFile(join(project, 'out'), 'file blocks directory');
		await expect(publishProject(project, {}, prince)).rejects.toThrow();
	});
	it('removes excluded one-way links and preserves included targets in published output', async () => {
		const source = join(project, 'data/alice.md');
		await writeFile(
			source,
			(await readFile(source, 'utf8')).replace(
				'type: person',
				'type: person\nmonoDirectionalLinks: [bob]',
			),
		);
		for (const include of [['alice'], ['alice', 'bob']]) {
			await publishProject(project, { include }, prince);
			for (const filename of ['auto.html', 'auto-complete.html']) {
				const html = await readFile(join(project, 'out', filename), 'utf8');
				expect(html.includes('href="#bob"')).toBe(include.includes('bob'));
				expect(html).toContain('Bob');
			}
		}
	});

	it.each(
		[[], ['ghost'], ['alice', 'ghost', 'missing'], ['alice', 'alice']].map((include) => ({
			include,
		})),
	)(
		'rejects invalid selections before changing files or invoking Prince: %j',
		async ({ include }) => {
			await mkdir(join(project, 'out'), { recursive: true });
			const filenames = [
				'templates/index.css',
				'out/auto.html',
				'out/auto.pdf',
				'out/auto-complete.html',
			];
			for (const filename of filenames)
				await writeFile(join(project, filename), `retained ${filename}`);
			const marker = join(project, 'prince-invoked');
			await writeFile(
				prince,
				(await readFile(prince, 'utf8')).replace(
					"const fs = require('node:fs');",
					`const fs = require('node:fs');\nfs.writeFileSync(${JSON.stringify(marker)}, 'invoked');`,
				),
			);
			await expect(publishProject(project, { include }, prince)).rejects.toThrow(/Include|include/);
			for (const filename of filenames)
				expect(await readFile(join(project, filename), 'utf8')).toBe(`retained ${filename}`);
			await expect(readFile(marker)).rejects.toMatchObject({ code: 'ENOENT' });
		},
	);
	it('rejects a selected entry removed since refresh before generating output', async () => {
		await refreshProject(project);
		await rm(join(project, 'data/bob.md'));
		await expect(publishProject(project, { include: ['alice', 'bob'] }, prince)).rejects.toThrow(
			'Unknown include slugs: bob',
		);
		await expect(readFile(join(project, 'templates/index.css'))).rejects.toMatchObject({
			code: 'ENOENT',
		});
	});

	it.each([{ include: undefined }, { include: ['alice'] }])(
		'matches shared compilation for the same project/theme/selection: %j',
		async ({ include }) => {
			const request = { theme: 'default', ...(include ? { include } : {}) };
			await publishProject(project, request, prince);
			const filenames = ['auto.html', 'auto.pdf', 'auto-complete.html'];
			const before = await Promise.all(
				filenames.map((filename) => readFile(join(project, 'out', filename))),
			);
			await compileProject({
				project,
				theme: 'default',
				html_file_name: join(project, 'out/auto.html'),
				pdf_file_name: join(project, 'out/auto.pdf'),
				embedded_html_file_name: join(project, 'out/auto-complete.html'),
				prince_binary: prince,
				...(include ? { include } : {}),
			});
			for (let index = 0; index < filenames.length; index++)
				expect(await readFile(join(project, 'out', filenames[index]))).toEqual(before[index]);
		},
	);

	it('rejects missing/nonzero Prince and preserves partial HTML without claiming completion', async () => {
		await expect(publishProject(project, {}, join(directory, 'missing'))).rejects.toThrow();
		expect(await readFile(join(project, 'out/auto.html'), 'utf8')).toContain('id="alice"');
		await writeFile(prince, '#!/bin/sh\necho "Prince stopped" >&2\nexit 7\n', { mode: 0o755 });
		await expect(publishProject(project, {}, prince)).rejects.toThrow('Prince stopped');
	});
});

it('returns link diagnostics from preparation and selected compilation without writing stderr', async () => {
	const { vi } = await import('vitest');
	const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
	try {
		const result = await publishProject(project, { include: ['alice'] }, prince);
		expect(result.diagnostics.items).toContainEqual({
			code: 'missing-link-target',
			severity: 'warning',
			source: 'alice',
			target: 'bob',
		});
		expect((await refreshProject(project)).diagnostics).toEqual({ items: [], omitted: 0 });
		expect(stderr).not.toHaveBeenCalled();
	} finally {
		stderr.mockRestore();
	}
});

it('matches library output for custom paths and independent overrides', async () => {
	const paths = {
		html: join(project, 'html/My book Ω.html'),
		pdf: join(directory, 'External book.pdf'),
		embeddedHtml: join(project, 'archive/standalone.html'),
	};
	const result = await publishProject(project, { include: ['alice'] }, prince, paths);
	expect(result.pdf).toBe(paths.pdf);
	const actualHtml = await readFile(paths.html, 'utf8');
	const actualEmbedded = await readFile(paths.embeddedHtml, 'utf8');
	await compileProject({
		project,
		theme: 'A5',
		include: ['alice'],
		prince_binary: prince,
		html_file_name: paths.html,
		pdf_file_name: paths.pdf,
		embedded_html_file_name: paths.embeddedHtml,
	});
	expect(await readFile(paths.html, 'utf8')).toBe(actualHtml);
	expect(await readFile(paths.embeddedHtml, 'utf8')).toBe(actualEmbedded);
	expect(await readFile(paths.pdf, 'utf8')).toBe('fake-pdf');
});

it('returns stage events and conservative facts for retained and partial outputs', async () => {
	const progress = [];
	const success = await publishProject(project, {}, prince, undefined, (event) =>
		progress.push(event),
	);
	expect(success.artifacts).toHaveLength(4);
	expect(success.artifacts.every((item) => item.status === 'completed')).toBe(true);
	expect(progress).toHaveLength(24);
	expect(progress.at(-1)).toEqual({ stage: 'output', status: 'completed' });
	const original = await readFile(join(project, 'out/auto.html'), 'utf8');
	try {
		await publishProject(project, { include: ['unknown'] }, prince);
		throw Error('Expected failure');
	} catch (error) {
		expect(error.artifacts).toHaveLength(4);
		expect(error.artifacts.every((item) => item.status === 'not-started')).toBe(true);
	}
	expect(await readFile(join(project, 'out/auto.html'), 'utf8')).toBe(original);
	await writeFile(
		prince,
		`#!/usr/bin/env node
const fs=require('node:fs');
fs.writeFileSync(process.argv[process.argv.indexOf('-o')+1],'partial PDF');
process.exitCode=1;
`,
		{ mode: 0o755 },
	);
	await expect(publishProject(project, {}, prince)).rejects.toMatchObject({
		stage: 'output',
		artifacts: expect.arrayContaining([
			{ kind: 'pdf', path: join(project, 'out/auto.pdf'), status: 'unverified' },
		]),
	});
	expect(await readFile(join(project, 'out/auto.pdf'), 'utf8')).toBe('partial PDF');
});
