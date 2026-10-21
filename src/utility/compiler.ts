import type { StageProgress } from '../shared/compilation.js';
import type { OutputPaths } from '../shared/outputs.js';
import { projectDiagnostics } from '../shared/diagnostics.js';
import { join } from 'node:path';
import { loadProject, compileProject } from 'cross-doc';
import type { GenerateHtmlOptions, OutputOptions } from 'cross-doc';
import type { ProjectSnapshot, PublishedFiles, PublishRequest } from '../shared/api.js';

function optionsFor(project: string, theme = 'A5'): GenerateHtmlOptions & OutputOptions {
	const basename = join(project, 'out', 'auto');
	return {
		project,
		theme,
		html_file_name: `${basename}.html`,
		embedded_html_file_name: `${basename}-complete.html`,
		pdf_file_name: `${basename}.pdf`,
	};
}

export async function refreshProject(project: string): Promise<ProjectSnapshot> {
	const { entries, categories, themes, diagnostics } = await loadProject({ project });
	return {
		project,
		entries: entries.map(({ slug, title, type }) => ({ slug, title, category: type })),
		categories: categories.map(({ category, heading }) => ({ id: category, heading })),
		themes,
		diagnostics: projectDiagnostics(diagnostics),
	};
}

export async function publishProject(
	project: string,
	request: PublishRequest,
	princeBinary: string,
	outputs?: OutputPaths,
	onProgress?: (event: StageProgress) => void,
): Promise<PublishedFiles> {
	const options = {
		...optionsFor(project, request.theme),
		prince_binary: princeBinary,
		...(outputs
			? {
					html_file_name: outputs.html,
					pdf_file_name: outputs.pdf,
					embedded_html_file_name: outputs.embeddedHtml,
				}
			: {}),
		...(request.include ? { include: request.include } : {}),
	};
	const result = await compileProject(options, onProgress ? { onProgress } : {});
	const pdf = result.artifacts.find(({ kind }) => kind === 'pdf');
	if (!pdf || pdf.status !== 'completed')
		throw new Error('Compilation did not complete PDF output');
	return {
		artifacts: [...result.artifacts],
		pdf: pdf.path,
		diagnostics: projectDiagnostics(result.diagnostics),
	};
}
