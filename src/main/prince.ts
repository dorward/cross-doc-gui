import { constants } from 'node:fs';
import { access, mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { delimiter, dirname, isAbsolute, join } from 'node:path';
import { record, text } from '../shared/validation.js';

export async function executable(filename: string): Promise<string> {
	if (!isAbsolute(filename) || !text(filename))
		throw new Error('Choose an absolute Prince executable path');
	const resolved = await realpath(filename);
	if (!(await stat(resolved)).isFile())
		throw new Error('Choose the Prince executable, not a directory');
	await access(resolved, constants.X_OK);
	return resolved;
}

export class PrinceConfiguration {
	constructor(
		private readonly filename: string,
		private readonly choose: () => Promise<string | null>,
		private readonly searchPath = process.env.PATH ?? '',
	) {}

	async chooseExecutable(): Promise<string | null> {
		const choice = await this.choose();
		if (!choice) return null;
		const binary = await executable(choice);
		await mkdir(dirname(this.filename), { recursive: true });
		await writeFile(this.filename, JSON.stringify({ binary }) + '\n', { mode: 0o600 });
		return binary;
	}

	async resolve(): Promise<string> {
		let saved: string;
		try {
			saved = await readFile(this.filename, 'utf8');
		} catch (error) {
			if (!(record(error) && error.code === 'ENOENT')) throw error;
			return this.fromPath();
		}
		try {
			const value: unknown = JSON.parse(saved);
			if (!record(value) || !text(value.binary)) throw new Error('Invalid Prince setting');
			return await executable(value.binary);
		} catch {
			throw new Error(
				'The saved Prince executable is unavailable. Use Choose Prince to select it again.',
			);
		}
	}

	private async fromPath(): Promise<string> {
		// Desktop launches need not inherit the shell's PATH. Add standard macOS
		// installation directories explicitly, without invoking a login shell.
		const directories = [
			...this.searchPath.split(delimiter),
			...(process.platform === 'darwin' ? ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin'] : []),
		];
		for (const directory of new Set(directories.filter(isAbsolute))) {
			try {
				return await executable(
					join(directory, process.platform === 'win32' ? 'prince.exe' : 'prince'),
				);
			} catch {
				/* Try the next absolute PATH directory. */
			}
		}
		throw new Error(
			'Prince was not found. Install Prince, then use Choose Prince to select its executable.',
		);
	}
}
