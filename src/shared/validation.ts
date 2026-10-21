import { artifactsFromError } from './compilation.js';
import { decodeDiagnostics } from './diagnostics.js';
import type { ProjectSnapshot, PublishedFiles, PublishRequest, PublishResult } from './api.js';

export const MAX_ENTRIES = 50_000;
const MAX_TEXT = 4096;
export const MAX_REQUEST_BYTES = 1_048_576;
export const MAX_SNAPSHOT_BYTES = 16_777_216;

function budget(limit: number): (value: string) => void {
	let remaining = limit;
	return (value) => {
		// Three bytes per UTF-16 code unit is a conservative UTF-8 upper bound.
		remaining -= value.length * 3 + 64;
		if (remaining < 0) throw new Error('Message exceeds the supported size');
	};
}

export function record(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function text(value: unknown): value is string {
	return (
		typeof value === 'string' &&
		value.length > 0 &&
		value.length <= MAX_TEXT &&
		!value.includes('\0')
	);
}

export function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
	return Object.keys(value).every((key) => keys.includes(key));
}

export function themeName(value: unknown): value is string {
	return text(value) && value !== '.' && value !== '..' && !/[\\/]/.test(value);
}

export function decodePublish(value: unknown, known?: ReadonlySet<string>): PublishRequest {
	if (!record(value) || !exactKeys(value, ['include', 'theme']))
		throw new Error('Invalid publish request');
	const theme: PublishRequest = {};
	if (Object.hasOwn(value, 'theme')) {
		if (!themeName(value.theme)) throw new Error('Invalid theme selection');
		theme.theme = value.theme;
	}
	if (!Object.hasOwn(value, 'include')) return theme;
	if (
		!Array.isArray(value.include) ||
		!value.include.length ||
		value.include.length > MAX_ENTRIES
	) {
		throw new Error('Choose one or more known entries');
	}
	const include: string[] = [];
	const count = budget(MAX_REQUEST_BYTES);
	for (const slug of value.include as unknown[]) {
		if (!text(slug) || (known && !known.has(slug)))
			throw new Error('Unknown or invalid entry selection');
		count(slug);
		include.push(slug);
	}
	if (new Set(include).size !== include.length) throw new Error('Duplicate entry selection');
	return { ...theme, include };
}

export function decodeSnapshot(value: unknown): ProjectSnapshot {
	if (
		!record(value) ||
		!exactKeys(value, ['project', 'entries', 'categories', 'themes', 'diagnostics']) ||
		!text(value.project) ||
		!Array.isArray(value.themes) ||
		value.themes.length > MAX_ENTRIES ||
		!Array.isArray(value.entries) ||
		value.entries.length > MAX_ENTRIES ||
		!Array.isArray(value.categories) ||
		value.categories.length > MAX_ENTRIES
	) {
		throw new Error('Invalid project response');
	}
	const count = budget(MAX_SNAPSHOT_BYTES);
	count(value.project);
	const themes = Array.from(value.themes as unknown[], (name) => {
		if (!themeName(name)) throw new Error('Invalid theme response');
		count(name);
		return name;
	});
	if (new Set(themes).size !== themes.length) throw new Error('Duplicate theme response');
	const categories = Array.from(value.categories as unknown[], (item) => {
		if (
			!record(item) ||
			!exactKeys(item, ['id', 'heading']) ||
			!text(item.id) ||
			!text(item.heading)
		)
			throw new Error('Invalid category response');
		count(item.id);
		count(item.heading);
		return { id: item.id, heading: item.heading };
	});
	const ids = new Set(categories.map(({ id }) => id));
	if (ids.size !== categories.length) throw new Error('Duplicate category response');
	const entries = Array.from(value.entries as unknown[], (item) => {
		if (
			!record(item) ||
			!exactKeys(item, ['slug', 'title', 'category']) ||
			!text(item.slug) ||
			!text(item.title) ||
			!text(item.category) ||
			!ids.has(item.category)
		)
			throw new Error('Invalid entry response');
		count(item.slug);
		count(item.title);
		count(item.category);
		return { slug: item.slug, title: item.title, category: item.category };
	});
	if (new Set(entries.map(({ slug }) => slug)).size !== entries.length)
		throw new Error('Duplicate entry response');
	return {
		project: value.project,
		entries,
		categories,
		themes,
		...(value.diagnostics === undefined
			? {}
			: { diagnostics: decodeDiagnostics(value.diagnostics) }),
	};
}

export function decodeFiles(value: unknown): PublishedFiles {
	if (!record(value) || !exactKeys(value, ['pdf', 'diagnostics', 'artifacts']) || !text(value.pdf))
		throw new Error('Invalid output response');
	return {
		pdf: value.pdf,
		...artifactsFromError(value),
		...(value.diagnostics === undefined
			? {}
			: { diagnostics: decodeDiagnostics(value.diagnostics) }),
	};
}

export function errorMessage(error: unknown): string {
	return (error instanceof Error && error.message ? error.message : 'Operation failed').slice(
		0,
		MAX_TEXT,
	);
}

export function decodePublished(value: unknown): PublishResult {
	if (
		!record(value) ||
		!exactKeys(value, ['pdf', 'preview', 'diagnostics', 'artifacts']) ||
		!text(value.pdf) ||
		!record(value.preview)
	)
		throw new Error('Invalid publish response');
	if (value.preview.ok === true)
		return {
			...decodeFiles({
				pdf: value.pdf,
				...artifactsFromError(value),
				...(value.diagnostics === undefined ? {} : { diagnostics: value.diagnostics }),
			}),
			preview: { ok: true },
		};
	if (value.preview.ok === false && text(value.preview.error))
		return {
			...decodeFiles({
				pdf: value.pdf,
				...artifactsFromError(value),
				...(value.diagnostics === undefined ? {} : { diagnostics: value.diagnostics }),
			}),
			preview: { ok: false, error: value.preview.error },
		};
	throw new Error('Invalid preview result');
}
export function decodeChoice(value: unknown): string | null {
	if (value !== null && !text(value)) throw new Error('Invalid executable selection');
	return value;
}
export function decodeNull(value: unknown): null {
	if (value !== null) throw new Error('Invalid application response');
	return null;
}
