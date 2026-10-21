import { lstat, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { decodeOutputPaths, decodeOutputSettings, outputKinds } from '../shared/outputs.js';
import type { OutputKind, OutputPaths, OutputSettings } from '../shared/outputs.js';

// Resolve the nearest existing ancestor, including existing destination symlinks.
// This authorizes current paths, not a sandbox against concurrent filesystem edits.
async function physical(path: string): Promise<string> {
	try {
		return await realpath(path);
	} catch (error) {
		if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
		try {
			if ((await lstat(path)).isSymbolicLink())
				throw new Error('Output path has an unresolved symbolic link');
		} catch (inspectionError) {
			if (
				!(
					inspectionError instanceof Error &&
					'code' in inspectionError &&
					inspectionError.code === 'ENOENT'
				)
			)
				throw inspectionError;
		}
		const parent = dirname(path);
		if (parent === path) throw error;
		return resolve(await physical(parent), relative(parent, path));
	}
}
const inside = (project: string, path: string) => {
	const rel = relative(project, path);
	return rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel);
};
export class OutputConfiguration {
	private settings: OutputSettings = { baseName: 'out/auto', html: '', pdf: '', embeddedHtml: '' };
	private approved = new Map<OutputKind, string>();
	constructor(private readonly project: string) {}
	get(): OutputSettings {
		return { ...this.settings };
	}
	async save(value: unknown): Promise<OutputSettings> {
		const settings = decodeOutputSettings(value);
		await this.resolve(settings);
		this.settings = settings;
		return this.get();
	}
	async choose(kind: OutputKind, path: string): Promise<OutputSettings> {
		if (!isAbsolute(path)) throw new Error('Choose an absolute output path');
		const previous = this.approved.get(kind);
		this.approved.set(kind, path);
		try {
			return await this.save({ ...this.settings, [kind]: path });
		} catch (error) {
			if (previous === undefined) this.approved.delete(kind);
			else this.approved.set(kind, previous);
			throw error;
		}
	}
	async paths(): Promise<OutputPaths> {
		return this.resolve(this.settings);
	}
	private async resolve(settings: OutputSettings): Promise<OutputPaths> {
		if (!settings.baseName.trim() || isAbsolute(settings.baseName))
			throw new Error('Use a project-relative output basename');
		const base = resolve(this.project, settings.baseName);
		if (!inside(this.project, base) || !inside(this.project, await physical(base)))
			throw new Error('Output basename must stay inside the project');
		const paths: OutputPaths = {
			html: base + '.html',
			pdf: base + '.pdf',
			embeddedHtml: base + '-complete.html',
		};
		for (const kind of outputKinds) {
			const value = settings[kind];
			const path = value ? resolve(this.project, value) : paths[kind];
			if (isAbsolute(value)) {
				if (this.approved.get(kind) !== value)
					throw new Error('Choose external output files with the native save dialog');
			} else if (!inside(this.project, path) || !inside(this.project, await physical(path))) {
				throw new Error(
					'Relative output paths must stay inside the project; use Choose file for external destinations',
				);
			}
			paths[kind] = path;
		}
		const physicalPaths = await Promise.all(outputKinds.map((kind) => physical(paths[kind])));
		if (
			new Set(physicalPaths).size !== outputKinds.length ||
			physicalPaths.includes(await physical(resolve(this.project, 'templates/index.css')))
		)
			throw new Error('Output files and the generated CSS must have distinct destinations');
		return decodeOutputPaths(paths);
	}
}
