import type { DiagnosticReport } from './api.js';
import { exactKeys, record, text } from './validation.js';

export const MAX_DIAGNOSTICS = 1000;
export const MAX_DIAGNOSTIC_BYTES = 262_144;
const codes = ['unused-one-way-link', 'missing-link-target', 'missing-reciprocal-link'] as const;

export function decodeDiagnostics(value: unknown): DiagnosticReport {
	if (
		!record(value) ||
		!exactKeys(value, ['items', 'omitted']) ||
		!Array.isArray(value.items) ||
		value.items.length > MAX_DIAGNOSTICS ||
		!Number.isSafeInteger(value.omitted) ||
		(value.omitted as number) < 0
	)
		throw new Error('Invalid diagnostic response');
	let bytes = 0;
	const items = Array.from(value.items as unknown[], (item) => {
		if (
			!record(item) ||
			!exactKeys(item, ['code', 'severity', 'source', 'target']) ||
			!codes.includes(item.code as (typeof codes)[number]) ||
			item.severity !== 'warning' ||
			!text(item.source) ||
			!text(item.target)
		)
			throw new Error('Invalid diagnostic response');
		bytes += (item.source.length + item.target.length) * 3 + 256;
		if (bytes > MAX_DIAGNOSTIC_BYTES) throw new Error('Diagnostic response exceeds supported size');
		return {
			code: item.code as (typeof codes)[number],
			severity: 'warning' as const,
			source: item.source,
			target: item.target,
		};
	});
	return { items, omitted: value.omitted as number };
}

// Project text is never sent without per-field, count and aggregate limits.
// Oversized items are omitted, not rewritten into misleading slug identifiers.
export function projectDiagnostics(
	items: readonly DiagnosticReport['items'][number][],
): DiagnosticReport {
	const report: DiagnosticReport = { items: [], omitted: 0 };
	let bytes = 0;
	for (const item of items) {
		const size = (item.source.length + item.target.length) * 3 + 256;
		if (
			report.items.length >= MAX_DIAGNOSTICS ||
			!text(item.source) ||
			!text(item.target) ||
			bytes + size > MAX_DIAGNOSTIC_BYTES
		) {
			report.omitted++;
			continue;
		}
		bytes += size;
		report.items.push({ ...item });
	}
	return decodeDiagnostics(report);
}

export function diagnosticsFromError(error: unknown): { diagnostics?: DiagnosticReport } {
	if (
		error !== null &&
		typeof error === 'object' &&
		'diagnostics' in error &&
		error.diagnostics !== undefined
	)
		return { diagnostics: decodeDiagnostics(error.diagnostics) };
	return {};
}
