import type { ColorMode } from './appearance.js';
import type { Artifact, ArtifactKind, StageProgress } from './compilation.js';
import type { OutputKind, OutputSettings } from './outputs.js';
export interface DiagnosticReport {
	items: {
		code: 'unused-one-way-link' | 'missing-link-target' | 'missing-reciprocal-link';
		severity: 'warning';
		source: string;
		target: string;
	}[];
	omitted: number;
}

export interface EntrySummary {
	slug: string;
	title: string;
	category: string;
}

export interface CategorySummary {
	id: string;
	heading: string;
}

export interface ProjectSnapshot {
	diagnostics?: DiagnosticReport;
	themes: string[];
	project: string;
	entries: EntrySummary[];
	categories: CategorySummary[];
}

export type Result<T> =
	| { ok: true; value: T }
	| { ok: false; error: string; diagnostics?: DiagnosticReport; artifacts?: Artifact[] };

export interface PublishRequest {
	theme?: string;
	// Absent means all entries. Never send an empty array.
	include?: string[];
}

export interface PublishedFiles {
	artifacts?: Artifact[];
	diagnostics?: DiagnosticReport;
	pdf: string;
}

export interface PublishResult extends PublishedFiles {
	preview: { ok: true } | { ok: false; error: string };
}

export interface DesktopApi {
	getAppearance: () => Promise<Result<ColorMode>>;
	setAppearance: (mode: ColorMode) => Promise<Result<ColorMode>>;
	revealArtifact: (kind: Exclude<ArtifactKind, 'css'>) => Promise<Result<null>>;
	getOutputs: () => Promise<Result<OutputSettings>>;
	setOutputs: (settings: OutputSettings) => Promise<Result<OutputSettings>>;
	chooseOutput: (kind: OutputKind) => Promise<Result<OutputSettings | null>>;
	getPrince: () => Promise<Result<string>>;
	chooseProject: () => Promise<Result<ProjectSnapshot | null>>;
	refresh: () => Promise<Result<ProjectSnapshot>>;
	publish: (
		request: PublishRequest,
		onProgress?: (event: StageProgress) => void,
	) => Promise<Result<PublishResult>>;
	choosePrince: () => Promise<Result<string | null>>;
	revealPdf: () => Promise<Result<null>>;
}
