// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Appearance } from '../src/main/appearance.ts';
import { decodeColorMode } from '../src/shared/appearance.ts';
let directory, filename;
beforeEach(async () => {
	directory = await mkdtemp(join(tmpdir(), 'gui-appearance-'));
	filename = join(directory, 'appearance.json');
});
afterEach(async () => {
	await rm(directory, { recursive: true, force: true });
});
it('defaults to system and recovers missing/invalid preference data', async () => {
	const apply = vi.fn();
	for (const text of [undefined, 'bad JSON', '"unknown"', '{"mode":"dark"}']) {
		if (text !== undefined) await writeFile(filename, text);
		const settings = new Appearance(filename, apply);
		await settings.initialize();
		expect(settings.get()).toBe('system');
		expect(apply).toHaveBeenLastCalledWith('system');
	}
});
it('persists valid modes across launches and serializes rapid saves', async () => {
	const apply = vi.fn();
	const settings = new Appearance(filename, apply);
	await settings.initialize();
	await Promise.all([settings.set('dark'), settings.set('light')]);
	expect(settings.get()).toBe('light');
	const restarted = new Appearance(filename, apply);
	await restarted.initialize();
	expect(restarted.get()).toBe('light');
	await restarted.set('system');
	expect(JSON.parse(await readFile(filename, 'utf8'))).toBe('system');
	expect(apply.mock.calls.map(([mode]) => mode)).toEqual([
		'system',
		'dark',
		'light',
		'light',
		'system',
	]);
});
it('keeps the active preference on save failure and rejects invalid IPC values', async () => {
	await writeFile(filename, '"light"');
	const apply = vi.fn();
	const settings = new Appearance(filename, apply);
	await settings.initialize();
	await rm(directory, { recursive: true });
	await writeFile(directory, 'not a directory');
	try {
		await expect(settings.set('dark')).rejects.toThrow();
		expect(settings.get()).toBe('light');
		expect(apply).toHaveBeenCalledExactlyOnceWith('light');
		for (const value of [null, {}, '', true, 'automatic']) {
			expect(() => decodeColorMode(value)).toThrow();
			expect(() => settings.set(value)).toThrow();
		}
	} finally {
		await rm(directory, { force: true });
	}
});
