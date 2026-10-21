import { exactKeys, record, text } from './validation.js';

export const artifactKinds = ['css', 'html', 'pdf', 'embedded-html'] as const;
export type ArtifactKind = (typeof artifactKinds)[number];
export interface Artifact {
	kind: ArtifactKind;
	path: string;
	status: 'not-started' | 'unverified' | 'completed';
}
export const stages = [
	'discover',
	'read',
	'parse',
	'clean',
	'metadata',
	'links',
	'sort',
	'render',
	'placeholders',
	'toc',
	'titles',
	'output',
] as const;
export interface StageProgress {
	stage: (typeof stages)[number];
	status: 'started' | 'completed';
}
export function decodeArtifacts(value: unknown): Artifact[] {
	if (!Array.isArray(value) || value.length > 4) throw new Error('Invalid artifact report');
	const seen = new Set<string>();
	return Array.from(value as unknown[], (item) => {
		if (
			!record(item) ||
			!exactKeys(item, ['kind', 'path', 'status']) ||
			!artifactKinds.includes(item.kind as ArtifactKind) ||
			!text(item.path) ||
			!['not-started', 'unverified', 'completed'].includes(item.status as string) ||
			seen.has(item.kind as string)
		)
			throw new Error('Invalid artifact report');
		seen.add(item.kind as string);
		return {
			kind: item.kind as ArtifactKind,
			path: item.path,
			status: item.status as Artifact['status'],
		};
	});
}
export function artifactsFromError(error: unknown): { artifacts?: Artifact[] } {
	if (
		error !== null &&
		typeof error === 'object' &&
		'artifacts' in error &&
		error.artifacts !== undefined
	)
		return { artifacts: decodeArtifacts(error.artifacts) };
	return {};
}
export function decodeStage(value: unknown): StageProgress {
	if (
		!record(value) ||
		!exactKeys(value, ['stage', 'status']) ||
		!stages.includes(value.stage as StageProgress['stage']) ||
		!['started', 'completed'].includes(value.status as string)
	)
		throw new Error('Invalid compilation progress');
	return {
		stage: value.stage as StageProgress['stage'],
		status: value.status as StageProgress['status'],
	};
}
// Exactly two events per stage, in pipeline order. No text or paths cross here.
export function stageSequence(): (value: unknown) => StageProgress {
	let index = 0;
	return (value) => {
		const event = decodeStage(value);
		if (
			index >= stages.length * 2 ||
			event.stage !== stages[Math.floor(index / 2)] ||
			event.status !== (index % 2 === 0 ? 'started' : 'completed')
		)
			throw new Error('Invalid compilation progress sequence');
		index++;
		return event;
	};
}
export function operationId(value: unknown): value is string {
	return (
		typeof value === 'string' &&
		/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
	);
}
