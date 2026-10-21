import { useAppearance } from './appearance.js';
import type { ColorMode } from '../shared/appearance.js';
import type { Artifact, StageProgress } from '../shared/compilation.js';
import { defaultOutputSettings, outputKinds } from '../shared/outputs.js';
import type { OutputSettings } from '../shared/outputs.js';
import { useEffect, useRef, useState } from 'react';
import { Toolbar } from 'primereact/toolbar';
import { Button } from 'primereact/button';
import { Tooltip } from 'primereact/tooltip';
import { Dialog } from 'primereact/dialog';
import { Tree } from 'primereact/tree';
import type { DesktopApi, DiagnosticReport, ProjectSnapshot, Result } from '../shared/api.js';
import { reconcileSelection, selectedSlugs, selectionKeys, treeNodes } from './selection.js';

export function App({ api = window.crossDoc }: { api?: DesktopApi }) {
	const appearance = useAppearance(api);
	const [artifacts, setArtifacts] = useState<Artifact[]>([]);
	const [progress, setProgress] = useState<StageProgress | null>(null);
	const [diagnostics, setDiagnostics] = useState<DiagnosticReport>({ items: [], omitted: 0 });
	const [outputs, setOutputs] = useState<OutputSettings | null>(null);
	const [outputDraft, setOutputDraft] = useState<OutputSettings>(defaultOutputSettings);
	const [snapshot, setSnapshot] = useState<ProjectSnapshot | null>(null);
	const [theme, setTheme] = useState('');
	const [selected, setSelected] = useState<string[]>([]);
	const [published, setPublished] = useState(false);
	const [previewWarning, setPreviewWarning] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [stale, setStale] = useState(false);
	const [status, setStatus] = useState('Open a project to begin.');
	const [error, setError] = useState<string | null>(null);
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [prince, setPrince] = useState<Result<string> | null>(null);
	const operation = useRef(false);
	const generation = useRef(Symbol());
	useEffect(() => {
		generation.current = Symbol();
		operation.current = false;
		return () => {
			generation.current = Symbol();
		};
	}, []);

	useEffect(() => {
		if (busy) return;
		let current = true;
		void api.getPrince().then(
			(result) => {
				if (current) setPrince(result);
			},
			() => {
				if (current)
					setPrince({ ok: false, error: 'Unable to check Prince. Choose its executable again.' });
			},
		);
		return () => {
			current = false;
		};
	}, [api, busy, settingsOpen]);

	const outputProject = snapshot?.project;
	useEffect(() => {
		if (!settingsOpen || !outputProject) return;
		let current = true;
		void api.getOutputs().then(
			(result) => {
				if (!current) return;
				if (result.ok) {
					setOutputs(result.value);
					setOutputDraft(result.value);
				} else setError(result.error);
			},
			() => {
				if (current) setError('Unable to load output settings.');
			},
		);
		return () => {
			current = false;
		};
	}, [api, settingsOpen, outputProject]);

	async function run<T>(
		message: string,
		action: () => Promise<Result<T>>,
		accept: (value: T) => void,
		refresh = false,
	) {
		if (operation.current) return;
		operation.current = true;
		const current = generation.current;
		setBusy(true);
		setProgress(null);
		setError(null);
		setStatus(message);
		try {
			const result = await action();
			if (current !== generation.current) return;
			if (!result.ok) {
				if (result.diagnostics) setDiagnostics(result.diagnostics);
				if (result.artifacts) setArtifacts(result.artifacts);
				throw new Error(result.error);
			}
			accept(result.value);
		} catch (failure) {
			if (current !== generation.current) return;
			setError(failure instanceof Error ? failure.message : 'Operation failed. Please retry.');
			setStatus('Operation failed. Please retry.');
			if (refresh) setStale(true);
		} finally {
			if (current === generation.current) {
				operation.current = false;
				setBusy(false);
			}
		}
	}

	const open = () =>
		run(
			'Opening project…',
			() => api.chooseProject(),
			(next) => {
				if (!next) {
					setStatus('Open cancelled.');
					return;
				}
				setSnapshot(next);
				setArtifacts([]);
				setDiagnostics(next.diagnostics ?? { items: [], omitted: 0 });
				setTheme(next.themes.includes('A5') ? 'A5' : (next.themes[0] ?? ''));
				setPublished(false);
				setPreviewWarning(null);
				setSelected(next.entries.map(({ slug }) => slug));
				setStale(false);
				setStatus('Project loaded.');
			},
		);
	const refresh = () =>
		run(
			'Refreshing project…',
			() => api.refresh(),
			(next) => {
				setSelected(
					snapshot
						? reconcileSelection(snapshot, next, selected)
						: next.entries.map(({ slug }) => slug),
				);
				setSnapshot(next);
				setDiagnostics(next.diagnostics ?? { items: [], omitted: 0 });
				setStale(false);
				setTheme((previous) =>
					next.themes.includes(previous)
						? previous
						: next.themes.includes('A5')
							? 'A5'
							: (next.themes[0] ?? ''),
				);
				setStatus('Project refreshed.');
			},
			true,
		);
	const publish = () => {
		const current = generation.current;
		let active = true;
		setArtifacts([]);
		setProgress(null);
		setPublished(false);
		setPreviewWarning(null);
		return run(
			'Publishing HTML, PDF and embedded HTML…',
			() =>
				api.publish(
					{
						theme,
						...(snapshot && selected.length === snapshot.entries.length
							? {}
							: { include: selected }),
					},
					(event) => {
						if (active && current === generation.current) setProgress(event);
					},
				),
			({ pdf, preview, diagnostics: warnings, artifacts: facts }) => {
				setArtifacts(facts ?? []);
				setDiagnostics(warnings ?? { items: [], omitted: 0 });
				setPublished(true);
				setStatus(`Published ${pdf}`);
				setPreviewWarning(
					preview.ok
						? null
						: `PDF saved, but preview failed: ${preview.error} Use Reveal PDF to locate it.`,
				);
			},
		).finally(() => {
			active = false;
		});
	};
	const acceptOutputs = (next: OutputSettings) => {
		setOutputs(next);
		setOutputDraft(next);
		setStatus('Output settings saved.');
	};
	const saveOutputs = () =>
		run('Saving output settings…', () => api.setOutputs(outputDraft), acceptOutputs);
	const outputDirty = outputs !== null && JSON.stringify(outputs) !== JSON.stringify(outputDraft);
	const chooseOutput = (kind: (typeof outputKinds)[number]) =>
		run(
			'Choosing output file…',
			() => api.chooseOutput(kind),
			(next) => {
				if (next) acceptOutputs(next);
				else setStatus('Output selection cancelled.');
			},
		);
	const choosePrince = () =>
		run(
			'Choosing Prince…',
			() => api.choosePrince(),
			(binary) => {
				setStatus(binary ? `Prince configured: ${binary}` : 'Prince selection cancelled.');
			},
		);
	const revealArtifact = (kind: 'html' | 'pdf' | 'embedded-html') =>
		run(
			'Revealing document…',
			() => api.revealArtifact(kind),
			() => setStatus('Document revealed in your file manager.'),
		);
	const reveal = () =>
		run(
			'Revealing PDF…',
			() => api.revealPdf(),
			() => setStatus('PDF revealed in your file manager.'),
		);

	return (
		<main aria-busy={busy}>
			<h1>Cross-Doc</h1>
			<Toolbar
				className="project-toolbar"
				aria-label="Project actions"
				start={
					<div className="actions">
						<Button
							label="Open"
							icon="pi pi-folder-open"
							disabled={busy}
							onClick={() => {
								void open();
							}}
						/>
						<Button
							label="Refresh"
							icon="pi pi-refresh"
							disabled={busy || !snapshot}
							onClick={() => {
								void refresh();
							}}
						/>
						{snapshot &&
							(snapshot.themes.length ? (
								<select
									aria-label="Theme"
									className="theme-picker p-inputtext"
									value={theme}
									disabled={busy}
									onChange={(event) => setTheme(event.target.value)}
								>
									{snapshot.themes.map((name) => (
										<option key={name} value={name}>
											{name}
										</option>
									))}
								</select>
							) : (
								<>
									<Tooltip
										target=".no-themes"
										content="The project has no themes"
										event="both"
										pt={{ root: { 'aria-hidden': false } }}
									/>
									<span
										className="no-themes pi pi-exclamation-triangle"
										tabIndex={0}
										role="img"
										aria-label="The project has no themes"
										data-pr-tooltip="The project has no themes"
									/>
								</>
							))}
						<Button
							label="Publish"
							icon="pi pi-file-pdf"
							disabled={busy || stale || !snapshot || !theme || selected.length === 0}
							onClick={() => {
								void publish();
							}}
						/>
						{published && (
							<Button
								label="Reveal PDF"
								icon="pi pi-folder-open"
								disabled={busy}
								onClick={() => {
									void reveal();
								}}
							/>
						)}
					</div>
				}
				end={
					<span className="settings-button">
						<Button
							icon="pi pi-cog"
							aria-label="Settings"
							title="Settings"
							aria-haspopup="dialog"
							aria-expanded={settingsOpen}
							onClick={() => {
								setOutputs(null);
								setSettingsOpen(true);
							}}
						/>
						{prince?.ok === false && (
							<span
								className="settings-attention"
								role="img"
								aria-label="Settings need attention"
							/>
						)}
					</span>
				}
			/>
			<Dialog
				header="Settings"
				visible={settingsOpen}
				onHide={() => setSettingsOpen(false)}
				modal
				className="settings-dialog"
			>
				<section aria-label="Appearance">
					<h2>Appearance</h2>
					<label htmlFor="color-mode">Color mode</label>
					<select
						id="color-mode"
						className="p-inputtext appearance-picker"
						disabled={!appearance.ready || appearance.saving}
						value={appearance.preference}
						onChange={(event) => {
							void appearance.choose(event.target.value as ColorMode);
						}}
					>
						<option value="system">System</option>
						<option value="light">Light</option>
						<option value="dark">Dark</option>
					</select>
					{appearance.saveError && <p role="alert">{appearance.saveError}</p>}
				</section>
				<h2>Prince binary</h2>
				{error && <p role="alert">{error}</p>}
				<p className="prince-path">
					{prince?.ok ? prince.value : 'No available Prince executable.'}
				</p>
				{prince?.ok === false && <p role="alert">Needs attention: {prince.error}</p>}
				{prince === null && <p>Checking for Prince…</p>}
				<Button
					label="Choose Prince"
					icon="pi pi-folder-open"
					disabled={busy}
					onClick={() => {
						void choosePrince();
					}}
				/>
				{snapshot && (
					<section aria-label="Output destinations">
						<h2>Output destinations</h2>
						<p>Paths are relative to the project. Choose file to use an external destination.</p>
						{outputs === null ? (
							<p>Loading output settings…</p>
						) : (
							<form
								onSubmit={(event) => {
									event.preventDefault();
									void saveOutputs();
								}}
							>
								<label htmlFor="output-basename">Output basename</label>
								<input
									id="output-basename"
									className="p-inputtext"
									value={outputDraft.baseName}
									disabled={busy}
									maxLength={4096}
									onChange={(event) =>
										setOutputDraft({ ...outputDraft, baseName: event.target.value })
									}
								/>
								{outputKinds.map((kind) => (
									<div key={kind} className="output-setting">
										<label htmlFor={'output-' + kind}>
											{kind === 'embeddedHtml' ? 'Embedded HTML' : kind.toUpperCase()} override
										</label>
										<input
											id={'output-' + kind}
											className="p-inputtext"
											value={outputDraft[kind]}
											disabled={busy}
											maxLength={4096}
											placeholder={
												outputDraft.baseName +
												(kind === 'embeddedHtml' ? '-complete.html' : '.' + kind)
											}
											onChange={(event) =>
												setOutputDraft({ ...outputDraft, [kind]: event.target.value })
											}
										/>
										<Button
											type="button"
											label="Choose file"
											aria-label={
												'Choose ' +
												(kind === 'embeddedHtml' ? 'embedded HTML' : kind.toUpperCase()) +
												' output'
											}
											disabled={busy || outputDirty}
											onClick={() => {
												void chooseOutput(kind);
											}}
										/>
									</div>
								))}
								<p>
									Leave overrides empty to use the basename. Save changes before choosing files.
								</p>
								<Button
									type="submit"
									label="Save output settings"
									disabled={busy || !outputDirty}
								/>
							</form>
						)}
					</section>
				)}
			</Dialog>
			{snapshot && <p className="project-path">{snapshot.project}</p>}
			<p role="status">{status}</p>

			{busy && progress && (
				<p aria-live="polite" aria-label="Compilation stage">
					{stageLabels[progress.stage]} — {progress.status}
				</p>
			)}
			{artifacts.length > 0 && (
				<section aria-label="Compilation artifacts">
					<h2>Output files</h2>
					<p>
						Completion describes this publish attempt. Existing files may remain when a phase was
						not attempted or its completion is unverified.
					</p>
					<table>
						<thead>
							<tr>
								<th>Output</th>
								<th>Path</th>
								<th>Phase</th>
								<th>Locate</th>
							</tr>
						</thead>
						<tbody>
							{artifacts.map((item) => (
								<tr key={item.kind}>
									<th scope="row">{artifactLabels[item.kind]}</th>
									<td className="artifact-path">{item.path}</td>
									<td>
										{item.status === 'completed'
											? 'Completed'
											: item.status === 'not-started'
												? 'Not attempted'
												: 'Completion unverified'}
									</td>
									<td>
										{item.kind !== 'css' && (
											<Button
												label="Reveal"
												aria-label={'Reveal ' + artifactLabels[item.kind] + ' artifact'}
												disabled={busy || item.status !== 'completed'}
												onClick={() => {
													if (item.kind !== 'css') void revealArtifact(item.kind);
												}}
											/>
										)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</section>
			)}
			{error && !settingsOpen && <p role="alert">{error}</p>}
			{previewWarning && <p role="alert">{previewWarning}</p>}
			{(diagnostics.items.length > 0 || diagnostics.omitted > 0) && (
				<details aria-label="Project warnings">
					<summary>Project warnings ({diagnostics.items.length + diagnostics.omitted})</summary>
					<ul>
						{diagnostics.items.map((item, index) => (
							<li key={index}>
								{item.source}:{' '}
								{item.code === 'missing-link-target'
									? 'links to non-existent target'
									: item.code === 'missing-reciprocal-link'
										? 'missing reciprocal link from'
										: 'one-way exemption has no link to'}{' '}
								{item.target} ({item.code})
							</li>
						))}
					</ul>
					{diagnostics.omitted > 0 && (
						<p>{diagnostics.omitted} further warnings omitted from this view.</p>
					)}
				</details>
			)}
			{snapshot && (
				<Tree
					key={snapshot.project}
					aria-label="Project entries"
					value={treeNodes(snapshot, busy)}
					selectionMode="checkbox"
					selectionKeys={selectionKeys(snapshot, selected)}
					onSelectionChange={(event) => {
						if (!busy && event.value && typeof event.value === 'object') {
							setSelected(selectedSlugs(snapshot, event.value));
						}
					}}
				/>
			)}
		</main>
	);
}

const artifactLabels = { css: 'CSS', html: 'HTML', pdf: 'PDF', 'embedded-html': 'Embedded HTML' };
const stageLabels: Record<StageProgress['stage'], string> = {
	discover: 'Discovering files',
	read: 'Reading files',
	parse: 'Parsing entries',
	clean: 'Cleaning HTML',
	metadata: 'Adding metadata',
	links: 'Checking links',
	sort: 'Sorting entries',
	render: 'Generating HTML and CSS',
	placeholders: 'Replacing placeholders',
	toc: 'Building table of contents',
	titles: 'Adding link titles',
	output: 'Writing HTML, PDF and embedded HTML',
};
