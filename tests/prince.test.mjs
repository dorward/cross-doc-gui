// @vitest-environment node
import { mkdtemp, mkdir, realpath, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PrinceConfiguration, executable } from '../src/main/prince.ts';

const directories = [];
afterEach(async () => {
	await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});
async function setup() {
	const dir = await realpath(await mkdtemp(join(tmpdir(), 'gui-prince-')));
	directories.push(dir);
	const bin = join(dir, 'binary with spaces');
	await writeFile(bin, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
	return { dir, bin, filename: join(dir, 'settings', 'prince.json') };
}

describe('main-owned Prince configuration', () => {
	it('persists a native executable selection and retains it after cancellation', async () => {
		const { bin, filename } = await setup();
		await expect(
			new PrinceConfiguration(filename, async () => bin).chooseExecutable(),
		).resolves.toBe(bin);
		expect(JSON.parse(await readFile(filename, 'utf8'))).toEqual({ binary: bin });
		const next = new PrinceConfiguration(filename, async () => null, '');
		await expect(next.chooseExecutable()).resolves.toBeNull();
		await expect(next.resolve()).resolves.toBe(bin);
	});
	it('finds Prince on the inherited PATH without a login shell', async () => {
		const { dir, filename } = await setup();
		const bin = join(dir, process.platform === 'win32' ? 'prince.exe' : 'prince');
		await writeFile(bin, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
		await expect(new PrinceConfiguration(filename, async () => null, dir).resolve()).resolves.toBe(
			bin,
		);
	});
	it('rejects directories/nonexecutables and explains stale or invalid saved settings', async () => {
		const { dir, filename } = await setup();
		await expect(executable(dir)).rejects.toThrow('not a directory');
		const bad = join(dir, 'not-executable');
		await writeFile(bad, 'text', { mode: 0o600 });
		if (process.platform !== 'win32') await expect(executable(bad)).rejects.toThrow();
		await mkdir(join(dir, 'settings'));
		for (const value of ['invalid json', JSON.stringify({ binary: '/missing/prince' })]) {
			await writeFile(filename, value);
			await expect(new PrinceConfiguration(filename, async () => null).resolve()).rejects.toThrow(
				'Choose Prince',
			);
		}
	});
});
