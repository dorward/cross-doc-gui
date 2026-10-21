import { artifactsFromError, stageSequence } from '../shared/compilation.js';
import type { StageProgress } from '../shared/compilation.js';
import type { OutputPaths } from '../shared/outputs.js';
import { diagnosticsFromError } from '../shared/diagnostics.js';
import { randomUUID } from 'node:crypto';
import type { ProjectSnapshot, PublishedFiles, PublishRequest } from '../shared/api.js';
import { decodeFiles, decodeSnapshot, record, text } from '../shared/validation.js';
import type { Job } from '../utility/protocol.js';

export interface Compiler {
	refresh(project: string): Promise<ProjectSnapshot>;
	publish(
		project: string,
		request: PublishRequest,
		princeBinary: string,
		outputs: OutputPaths,
		onProgress?: (event: StageProgress) => void,
	): Promise<PublishedFiles>;
	stop(): void;
}

// Structural interface keeps lifecycle tests independent of Electron's launcher.
export interface WorkerProcess {
	on(event: 'message', listener: (message: unknown) => void): unknown;
	on(event: 'exit', listener: (code: number) => void): unknown;
	on(event: 'error', listener: () => void): unknown;
	postMessage(message: Job): void;
	kill(): boolean;
}

type JobInput =
	| { kind: 'refresh'; project: string }
	| {
			kind: 'publish';
			project: string;
			request: PublishRequest;
			princeBinary: string;
			outputs: OutputPaths;
	  };

export class CompilerWorker implements Compiler {
	private active: { child: WorkerProcess; cancel: () => void } | null = null;
	private closed = false;

	constructor(
		private readonly fork: () => WorkerProcess,
		private readonly timeoutMs = 120_000,
	) {}

	refresh(project: string): Promise<ProjectSnapshot> {
		return this.run({ kind: 'refresh', project }, decodeSnapshot);
	}

	publish(
		project: string,
		request: PublishRequest,
		princeBinary: string,
		outputs: OutputPaths,
		onProgress?: (event: StageProgress) => void,
	): Promise<PublishedFiles> {
		return this.run(
			{ kind: 'publish', project, request, princeBinary, outputs },
			decodeFiles,
			onProgress,
		);
	}

	stop(): void {
		this.closed = true;
		this.active?.cancel();
	}

	private run<T>(
		input: JobInput,
		decode: (value: unknown) => T,
		onProgress?: (event: StageProgress) => void,
	): Promise<T> {
		if (this.closed) return Promise.reject(new Error('Compiler session is closed'));
		if (this.active) return Promise.reject(new Error('Compiler is busy'));
		return new Promise<T>((resolve, reject) => {
			const child = this.fork();
			const id = randomUUID();
			const sequence = stageSequence();
			let sent = false;
			let settled = false;
			let reapTimer: ReturnType<typeof setTimeout> | undefined;
			let response: { value: T } | { error: Error } | null = null;
			const finish = (error?: Error, release = true) => {
				if (settled) return;
				settled = true;
				clearTimeout(timer);
				clearTimeout(reapTimer);
				if (release) this.active = null;
				if (error) reject(error);
				else if (response && 'value' in response) resolve(response.value);
				else
					reject(
						response && 'error' in response
							? response.error
							: new Error('Compiler exited before completing the operation'),
					);
			};
			const retire = () => {
				clearTimeout(timer);
				if (reapTimer) return;
				// A failed/stuck kill must reject the request without allowing another
				// worker to overlap it. The application also tracks live workers across sessions.
				reapTimer = setTimeout(() => {
					this.closed = true;
					finish(new Error('Compiler did not stop. Restart the application.'), false);
				}, 2000);
				try {
					child.kill();
				} catch {
					/* The reap deadline below bounds termination failure. */
				}
			};
			const terminate = (error: Error) => {
				if (settled) return;
				response = { error };
				retire();
			};
			const timer = setTimeout(
				() => terminate(new Error('Compiler timed out. Please retry.')),
				this.timeoutMs,
			);
			this.active = { child, cancel: () => terminate(new Error('Compiler session is closed')) };
			child.on('error', () => terminate(new Error('Compiler failed. Please retry.')));
			child.on('exit', (code) => {
				if (this.active?.child === child) this.active = null;
				finish(
					response ? undefined : new Error(`Compiler exited unexpectedly (${code}). Please retry.`),
				);
			});
			child.on('message', (message) => {
				if (settled || response) return;
				try {
					if (!record(message)) throw new Error('Invalid compiler response');
					if (!sent && message.ready === true) {
						sent = true;
						child.postMessage({ ...input, id });
						return;
					}
					if ('progress' in message) {
						if (!sent || message.id !== id) return;
						if (input.kind !== 'publish') throw new Error('Unexpected compiler progress');
						const progress = sequence(message.progress);
						onProgress?.(progress);
						return;
					}
					if (!sent || message.id !== id || !record(message.result))
						throw new Error('Invalid compiler response ID');
					if (message.result.ok === true) response = { value: decode(message.result.value) };
					else if (message.result.ok === false && text(message.result.error))
						response = {
							error: Object.assign(
								new Error(message.result.error),
								diagnosticsFromError(message.result),
								artifactsFromError(message.result),
							),
						};
					else throw new Error('Invalid compiler result');
					retire();
				} catch (error) {
					terminate(error instanceof Error ? error : new Error('Invalid compiler response'));
				}
			});
		});
	}
}
