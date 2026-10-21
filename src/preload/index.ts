import { decodeColorMode } from '../shared/appearance.js';
import { artifactsFromError, operationId, stageSequence } from '../shared/compilation.js';
import { decodeOutputKind, decodeOutputSettings } from '../shared/outputs.js';
import { diagnosticsFromError } from '../shared/diagnostics.js';
import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopApi, Result } from '../shared/api.js';
import {
	decodePublished,
	decodeChoice,
	decodeNull,
	decodePublish,
	decodeSnapshot,
	errorMessage,
	record,
	text,
} from '../shared/validation.js';

async function invoke<T>(
	channel: string,
	args: unknown[],
	decode: (value: unknown) => T,
): Promise<Result<T>> {
	try {
		const response: unknown = await ipcRenderer.invoke(channel, ...args);
		if (!record(response)) throw new Error('Invalid application response');
		if (response.ok === false && text(response.error))
			return {
				ok: false,
				error: response.error,
				...diagnosticsFromError(response),
				...artifactsFromError(response),
			};
		if (response.ok !== true) throw new Error('Invalid application response');
		return { ok: true, value: decode(response.value) };
	} catch (error) {
		return { ok: false, error: errorMessage(error) };
	}
}

const api: DesktopApi = {
	getAppearance: () => invoke('appearance:get', [], decodeColorMode),
	setAppearance: async (value) => {
		try {
			return await invoke('appearance:set', [decodeColorMode(value)], decodeColorMode);
		} catch (error) {
			return { ok: false, error: errorMessage(error) };
		}
	},
	revealArtifact: async (kind) => {
		if (!['html', 'pdf', 'embedded-html'].includes(kind))
			return { ok: false, error: 'Invalid document artifact' };
		return invoke('artifact:reveal', [kind], decodeNull);
	},
	getOutputs: () => invoke('outputs:get', [], decodeOutputSettings),
	setOutputs: async (value) => {
		try {
			return await invoke('outputs:set', [decodeOutputSettings(value)], decodeOutputSettings);
		} catch (error) {
			return { ok: false, error: errorMessage(error) };
		}
	},
	chooseOutput: async (value) => {
		try {
			return await invoke('outputs:choose', [decodeOutputKind(value)], (value) =>
				value === null ? null : decodeOutputSettings(value),
			);
		} catch (error) {
			return { ok: false, error: errorMessage(error) };
		}
	},
	getPrince: () =>
		invoke('prince:get', [], (value) => {
			if (!text(value)) throw new Error('Invalid Prince path');
			return value;
		}),
	chooseProject: () =>
		invoke('project:choose', [], (value) => (value === null ? null : decodeSnapshot(value))),
	refresh: () => invoke('project:refresh', [], decodeSnapshot),
	choosePrince: () => invoke('prince:choose', [], decodeChoice),
	revealPdf: () => invoke('pdf:reveal', [], decodeNull),
	publish: async (value, onProgress) => {
		const id = crypto.randomUUID();
		const sequence = stageSequence();
		let active = true;
		const listener = (_event: unknown, message: unknown) => {
			if (!active || !record(message) || !operationId(message.id) || message.id !== id) return;
			try {
				const progress = sequence(message.progress);
				onProgress?.(progress);
			} catch {
				active = false;
			}
		};
		ipcRenderer.on('publish:progress', listener);
		try {
			return await invoke('project:publish', [decodePublish(value), id], decodePublished);
		} catch (error) {
			return { ok: false, error: errorMessage(error) };
		} finally {
			active = false;
			ipcRenderer.removeListener('publish:progress', listener);
		}
	},
};
contextBridge.exposeInMainWorld('crossDoc', Object.freeze(api));
