import { readFile, mkdir, writeFile, rename, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { decodeColorMode } from '../shared/appearance.js';
import type { ColorMode } from '../shared/appearance.js';

export class Appearance {
	private preference: ColorMode = 'system';
	private pending: Promise<unknown> = Promise.resolve();
	constructor(
		private readonly filename: string,
		private readonly apply: (mode: ColorMode) => void,
	) {}
	async initialize(): Promise<void> {
		try {
			const saved: unknown = JSON.parse(await readFile(this.filename, 'utf8'));
			this.preference = decodeColorMode(saved);
		} catch {
			// Missing or invalid preferences recover to the system default.
			this.preference = 'system';
		}
		this.apply(this.preference);
	}
	get(): ColorMode {
		return this.preference;
	}
	set(value: unknown): Promise<ColorMode> {
		const preference = decodeColorMode(value);
		const save = async () => {
			await mkdir(dirname(this.filename), { recursive: true });
			const temporary = this.filename + '.tmp';
			try {
				await writeFile(temporary, JSON.stringify(preference) + '\n', { mode: 0o600 });
				await rename(temporary, this.filename);
			} finally {
				await rm(temporary, { force: true });
			}
			this.preference = preference;
			this.apply(preference);
			return preference;
		};
		const result = this.pending.catch(() => {}).then(save);
		this.pending = result;
		return result;
	}
}
