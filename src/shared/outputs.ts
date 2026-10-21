import { exactKeys, record, text } from './validation.js';

export const outputKinds = ['html', 'pdf', 'embeddedHtml'] as const;
export type OutputKind = (typeof outputKinds)[number];
export interface OutputSettings {
	baseName: string;
	html: string;
	pdf: string;
	embeddedHtml: string;
}
export interface OutputPaths {
	html: string;
	pdf: string;
	embeddedHtml: string;
}
export const defaultOutputSettings = (): OutputSettings => ({
	baseName: 'out/auto',
	html: '',
	pdf: '',
	embeddedHtml: '',
});

export function decodeOutputKind(value: unknown): OutputKind {
	if (!outputKinds.includes(value as OutputKind)) throw new Error('Invalid output kind');
	return value as OutputKind;
}
export function decodeOutputSettings(value: unknown): OutputSettings {
	if (!record(value) || !exactKeys(value, ['baseName', ...outputKinds]) || !text(value.baseName))
		throw new Error('Invalid output settings');
	for (const key of outputKinds)
		if (value[key] !== '' && !text(value[key])) throw new Error('Invalid output settings');
	return {
		baseName: value.baseName,
		html: value.html as string,
		pdf: value.pdf as string,
		embeddedHtml: value.embeddedHtml as string,
	};
}
export function decodeOutputPaths(value: unknown): OutputPaths {
	if (
		!record(value) ||
		!exactKeys(value, outputKinds) ||
		outputKinds.some((key) => !text(value[key]))
	)
		throw new Error('Invalid output paths');
	return {
		html: value.html as string,
		pdf: value.pdf as string,
		embeddedHtml: value.embeddedHtml as string,
	};
}
