import { artifactsFromError } from '../shared/compilation.js';
import type { Artifact, ArtifactKind, StageProgress } from '../shared/compilation.js';
import { OutputConfiguration } from './outputs.js';
import { decodeOutputKind } from '../shared/outputs.js';
import type { OutputKind, OutputSettings } from '../shared/outputs.js';
import { diagnosticsFromError } from '../shared/diagnostics.js';
import { realpath, stat } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import type { ProjectSnapshot, PublishedFiles, PublishResult } from '../shared/api.js';
import { decodePublish, errorMessage } from '../shared/validation.js';
import type { Compiler } from './worker.js';

export interface PublishServices {
	princeBinary(): Promise<string>;
	choosePrince(): Promise<string | null>;
	chooseOutput?(kind: OutputKind, defaultPath: string): Promise<string | null>;
	preview(pdf: string): Promise<void>;
	reveal(pdf: string): Promise<void>;
	closePreview(): void;
	dispose(): void;
}

export class ProjectSession {
	private outputs: OutputConfiguration | null = null;
	private snapshot: ProjectSnapshot | null = null;
	private stale = true;
	private active: symbol | null = null;
	private closed = false;
	private artifacts: Artifact[] = [];
	private lastPdf: string | null = null;

	constructor(
		private readonly compiler: Compiler,
		private readonly chooseDirectory: () => Promise<string | null>,
		private readonly services: PublishServices,
	) {}

	close(): void {
		this.closed = true;
		this.snapshot = null;
		this.outputs = null;
		this.compiler.stop();
		this.services.dispose();
		this.lastPdf = null;
		this.artifacts = [];
	}

	choose(): Promise<ProjectSnapshot | null> {
		return this.run(async () => {
			const chosen = await this.chooseDirectory();
			this.assertOpen();
			if (!chosen) return null;
			if (!isAbsolute(chosen)) throw new Error('Choose an absolute project directory');
			const project = await realpath(chosen);
			if (!(await stat(project)).isDirectory()) throw new Error('Choose a project directory');
			this.assertOpen();
			const snapshot = await this.compiler.refresh(project);
			this.assertOpen();
			if (snapshot.project !== project) throw new Error('Compiler returned the wrong project');
			if (this.snapshot?.project !== project || !this.outputs)
				this.outputs = new OutputConfiguration(project);
			this.snapshot = snapshot;
			this.lastPdf = null;
			this.artifacts = [];
			this.services.closePreview();
			this.stale = false;
			return snapshot;
		});
	}

	refresh(): Promise<ProjectSnapshot> {
		return this.run(async () => {
			const project = this.selected().project;
			this.stale = true;
			const snapshot = await this.compiler.refresh(project);
			this.assertOpen();
			if (snapshot.project !== project) throw new Error('Compiler returned the wrong project');
			this.snapshot = snapshot;
			this.stale = false;
			return snapshot;
		});
	}

	publish(value: unknown, onProgress?: (event: StageProgress) => void): Promise<PublishResult> {
		return this.run(async () => {
			const snapshot = this.selected();
			if (this.stale) throw new Error('Refresh the project before publishing');
			if (!snapshot.entries.length) throw new Error('There are no entries to publish');
			const request = decodePublish(value, new Set(snapshot.entries.map(({ slug }) => slug)));
			const theme = request.theme ?? (snapshot.themes.includes('A5') ? 'A5' : snapshot.themes[0]);
			if (!theme || !snapshot.themes.includes(theme))
				throw new Error('Choose a supported project theme before publishing');
			request.theme = theme;
			const outputs = await this.outputConfiguration().paths();
			const princeBinary = await this.services.princeBinary();
			this.assertOpen();
			this.lastPdf = null;
			this.artifacts = [];
			this.services.closePreview();
			const token = this.active;
			const expected: Record<ArtifactKind, string> = {
				css: join(snapshot.project, 'templates/index.css'),
				html: outputs.html,
				pdf: outputs.pdf,
				'embedded-html': outputs.embeddedHtml,
			};
			const acceptArtifacts = (value: unknown) => {
				const facts = artifactsFromError(value);
				if (facts.artifacts?.some((item) => item.path !== expected[item.kind]))
					throw new Error('Compiler returned an unexpected artifact path');
				this.artifacts = facts.artifacts ?? [];
				return facts;
			};
			let files: PublishedFiles;
			try {
				files = await this.compiler.publish(
					snapshot.project,
					request,
					princeBinary,
					outputs,
					(event) => {
						if (!this.closed && this.active === token) onProgress?.(event);
					},
				);
				this.assertOpen();
				if (files.pdf !== outputs.pdf)
					throw new Error('Compiler returned an unexpected output path');
				if (
					files.artifacts &&
					(files.artifacts.length !== 4 ||
						files.artifacts.some((item) => item.status !== 'completed'))
				)
					throw new Error('Compiler did not complete the reported artifacts');
				acceptArtifacts(files);
			} catch (error) {
				throw Object.assign(
					new Error(
						`${errorMessage(error)} Publishing failed; partial HTML/CSS/PDF files may remain. Retry after correcting the problem.`,
					),
					diagnosticsFromError(error),
					acceptArtifacts(error),
				);
			}
			this.assertOpen();
			this.lastPdf = files.pdf;
			try {
				await this.services.preview(files.pdf);
				this.assertOpen();
				return { ...files, preview: { ok: true } };
			} catch (error) {
				this.assertOpen();
				return { ...files, preview: { ok: false, error: errorMessage(error) } };
			}
		});
	}

	async getOutputs(): Promise<OutputSettings> {
		this.assertOpen();
		return this.outputConfiguration().get();
	}
	setOutputs(value: unknown): Promise<OutputSettings> {
		return this.run(async () => {
			const settings = await this.outputConfiguration().save(value);
			this.assertOpen();
			return settings;
		});
	}
	chooseOutput(value: unknown): Promise<OutputSettings | null> {
		return this.run(async () => {
			const kind = decodeOutputKind(value);
			const configuration = this.outputConfiguration();
			const paths = await configuration.paths();
			if (!this.services.chooseOutput) throw new Error('Output chooser is unavailable');
			const chosen = await this.services.chooseOutput(kind, paths[kind]);
			this.assertOpen();
			if (!chosen) return null;
			return configuration.choose(kind, chosen);
		});
	}
	private outputConfiguration(): OutputConfiguration {
		this.selected();
		if (!this.outputs) throw new Error('Open a project first');
		return this.outputs;
	}

	async getPrince(): Promise<string> {
		this.assertOpen();
		const binary = await this.services.princeBinary();
		this.assertOpen();
		return binary;
	}

	choosePrince(): Promise<string | null> {
		return this.run(() => this.services.choosePrince());
	}

	revealArtifact(kind: unknown): Promise<null> {
		return this.run(async () => {
			if (!['html', 'pdf', 'embedded-html'].includes(kind as string))
				throw new Error('Invalid document artifact');
			const artifact = this.artifacts.find(
				(item) => item.kind === kind && item.status === 'completed',
			);
			if (!artifact) throw new Error('Publish this document successfully before revealing it');
			if (!(await stat(artifact.path)).isFile())
				throw new Error('The generated file is no longer available');
			this.assertOpen();
			await this.services.reveal(artifact.path);
			return null;
		});
	}

	revealPdf(): Promise<null> {
		return this.run(async () => {
			if (!this.lastPdf) throw new Error('Publish a PDF successfully before revealing it');
			await this.services.reveal(this.lastPdf);
			return null;
		});
	}

	private selected(): ProjectSnapshot {
		if (!this.snapshot) throw new Error('Open a project first');
		return this.snapshot;
	}

	private assertOpen(): void {
		if (this.closed) throw new Error('Project session is closed');
	}

	private async run<T>(action: () => Promise<T>): Promise<T> {
		this.assertOpen();
		if (this.active) throw new Error('An operation is already running');
		const token = Symbol();
		this.active = token;
		try {
			const value = await action();
			this.assertOpen();
			return value;
		} finally {
			if (this.active === token) this.active = null;
		}
	}
}
