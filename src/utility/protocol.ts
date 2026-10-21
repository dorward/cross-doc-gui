import { decodeOutputPaths, outputKinds } from '../shared/outputs.js';
import type { OutputPaths } from '../shared/outputs.js';
import type { PublishRequest } from '../shared/api.js';
import { decodePublish, exactKeys, record, text } from '../shared/validation.js';
import { isAbsolute } from 'node:path';

export type Job = { id: string; project: string } & (
	| { kind: 'refresh' }
	| { kind: 'publish'; request: PublishRequest; princeBinary: string; outputs: OutputPaths }
);

export function decodeJob(value: unknown): Job {
	if (!record(value) || !text(value.id) || !text(value.project) || !isAbsolute(value.project))
		throw new Error('Invalid compiler job');
	if (value.kind === 'refresh' && exactKeys(value, ['id', 'kind', 'project']))
		return { id: value.id, project: value.project, kind: 'refresh' };
	if (
		value.kind === 'publish' &&
		text(value.princeBinary) &&
		isAbsolute(value.princeBinary) &&
		exactKeys(value, ['id', 'kind', 'project', 'request', 'princeBinary', 'outputs'])
	) {
		const outputs = decodeOutputPaths(value.outputs);
		if (outputKinds.some((kind) => !isAbsolute(outputs[kind])))
			throw new Error('Compiler output paths must be absolute');
		return {
			outputs,
			id: value.id,
			project: value.project,
			kind: 'publish',
			request: decodePublish(value.request),
			princeBinary: value.princeBinary,
		};
	}
	throw new Error('Invalid compiler operation');
}
