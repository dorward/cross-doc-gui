# Publishing and PDF preview

Open a trusted project, select entries (or keep all selected), then Publish.
Choose a project theme from the dropdown before Publish. A5 is selected
initially when available; otherwise the first sorted theme is used. Output defaults to the selected project's
`out/auto.html`, `out/auto.pdf` and `out/auto-complete.html`; the compiler awaits
all three before reporting success. Settings → Output destinations changes these
paths for the current project. The fixture's A5 alias uses its minimal A4
SCSS, so its four-page output is a regression fixture, not an A5 design sample.

## Prince installation and selection

Prince is an external executable, not a bundled npm wrapper or browser print
replacement. Install it from the [official downloads](https://www.princexml.com/download/)
and use an appropriate [Prince license](https://www.princexml.com/purchase/).
The GUI does not install, distribute or license Prince. Local validation used
Prince 17 with the machine's existing non-commercial license; its logo remains
in the fixture output.

Without a saved selection, main searches absolute PATH directories for Prince.
macOS desktop launches also check /opt/homebrew/bin, /usr/local/bin and /usr/bin,
without running a login shell. Empty/relative PATH entries are ignored. For any
other installation, open **Settings** using the toolbar cog, click **Choose Prince** and select its executable in the
native dialog. Directories and nonexecutable files are rejected. Cancellation
retains the previous setting. Main canonicalizes and saves the chosen absolute
path in `prince.json` under Electron's userData directory, so it survives app
restarts and renderer reloads. If that installation moves or disappears, select
it again. The renderer cannot submit executable paths, arguments or commands.

The utility receives the resolved absolute executable through validated internal
IPC and passes `prince_binary` to cross-doc's public output API. No shell is used.
Prince rendering has network access disabled and retains the library's 30-second
timeout and output limit. Sass/templates/raw HTML remain trusted local inputs;
this is not a filesystem sandbox for unknown projects.

## Preview and recovery

Only successful, fully awaited compilation opens PDF preview. The dedicated
BrowserWindow uses Electron's built-in PDF viewer with Node integration off,
context isolation and sandbox on, no application preload, and a separate memory
session. Popups, unexpected navigation, webviews, permissions and network fetches
are blocked. The viewer receives only the main-owned generated PDF path.

A missing/unreadable file, invalid PDF header, failed load or preview timeout is
reported separately: **the PDF was saved but preview failed**. Compilation stays
successful, and **Reveal PDF** locates the last successfully generated file in
the file manager. The action accepts no renderer path and is cleared on project
change or a new attempted write. If the preview renderer crashes after loading,
a native warning explains that the file is still saved. Project/window/session
closure destroys its preview, including any in-flight load.

Compilation errors are shown with their diagnostic and permit retry. A failure
later in the pipeline can leave HTML/CSS or PDF files behind; publication is not
an atomic multi-file transaction. A failed refresh requires successful refresh
before another publish. A viewer failure does not discard the completed files.

## Verification

`pnpm test` checks the reviewed HTML baseline, assets, input/output failures,
settings persistence/cancellation, main-owned paths and UI fallback state, using
fake Prince executables for routine process tests. Those fake bytes deliberately
fail the preview header check rather than pretending to be rendered PDFs.

`pnpm run test:timeout` separately exercises the real 30-second executable
timeout. `pnpm run test:pdf` builds and uses installed Prince plus Poppler
(pdfinfo, pdftotext, pdftoppm), then loads the result in actual Electron. It checks
four pages and fixture text, captures the viewer, renders page PNGs, and tests
preview-renderer crash recovery/reveal. Set CROSS_DOC_PRINCE_BINARY to an absolute
executable path if needed. Optionally set CROSS_DOC_PDF_ARTIFACT_DIR to retain
review images and generated outputs; normal runs remove temporary data. These
are local development checks. Packaged/ASAR layout and platform CI follow in
batch 5; the viewer has currently been verified on macOS with Electron 45.

## Packaged application

The extracted macOS arm64 ZIP also passes real Prince generation and isolated
PDF preview checks. Prince remains external and is selected/persisted through
the same native chooser. Linux hosted validation is pending. See
[packaging](packaging.md) for build and distributable test commands.

The icon-only Settings button sits on the toolbar’s right. A red corner dot
indicates that Prince could not be resolved (including an unavailable saved
executable). The dialog shows the current resolved path or attention message.
Without a saved override, the app searches PATH as described above; choosing
an executable preserves the existing native validation and persistence.

Themes are immediate subdirectories of `templates/` containing `index.scss`.
The menu refreshes with the project, retaining the current choice when it still
exists. Opening another project resets the choice. Projects without themes
show a warning icon with the tooltip “The project has no themes” and Publish
is disabled. Main accepts only discovered theme names; the utility rechecks
availability before compilation.

Explicit entry selections are checked against current discovered files before
compilation writes output. An entry removed since refresh causes publishing to
fail with an unknown-slug message; refresh the project to reconcile selection.

Theme/category discovery is shared library behavior. The GUI receives validated
categories and theme names from loadProject, and publishing revalidates the
chosen theme in the library before CSS/output writes. Theme directories must
be real immediate directories; symlinked directories are omitted. An index.scss
symlink is accepted if it resolves to a regular file. This is a discovery policy,
not a filesystem sandbox for trusted Sass projects.

## Project warnings

Open, refresh and publish show a collapsible Project warnings list with source,
target and diagnostic code. A successful refresh/publish replaces the previous
list, including clearing resolved warnings. A cancelled open preserves it.
Warnings reported before a compilation failure remain visible alongside the
error; transport/worker failures retain the last known warnings.

The utility projects library diagnostics into a transport report with at most
1,000 items and a conservative 256 KiB item budget. Each source/target is limited
to 4,096 characters; oversized items are omitted rather than changing their
identifiers. An explicit omitted count is displayed. Worker controller and
preload validate the same code/severity/field/count/aggregate limits on success
and failure. No renderer process/console bridge is added. Reports are optional
for compatibility with earlier internal responses; production operations include
them. A selected publish reports missing targets relative to that selection.

## Output destinations

Open a project, then **Settings → Output destinations**. Set a project-relative
basename (default out/auto); leave an override blank to derive its filename from
that basename. HTML, PDF and embedded HTML have independent overrides. Save
output settings before using **Choose file** to select an external destination.
The native save dialog supplies overwrite confirmation for an existing selected
file. Relative paths resolve from the project, independently of launch cwd.

A save is atomic as configuration: invalid settings retain the previous values
and do not write documents. Cancelling a native chooser retains the configuration.
Settings survive refresh and reopening the same project in the current session;
switching projects resets them to out/auto. They are not persisted across app
restart or renderer reload. Unsaved form edits are discarded on closing Settings.

Main owns the resolved configuration and sends explicit absolute paths to the
utility. Publish requests still contain only theme/include. New absolute paths
require native selection for the corresponding output kind; merely typing an
absolute path does not authorize it. Relative paths cannot escape the project
lexically or through currently resolved symlinks; unresolved symlinks are rejected.
Validation runs again before publishing. All three documents and the fixed
templates/index.css must have distinct resolved destinations. These checks do
not protect against concurrent filesystem changes or sandbox trusted project
templates, Sass or Prince.

Preview and Reveal PDF follow the PDF completed by the last successful publish,
including an external native-selected destination. Configuration changes alone
do not produce files. A failed write can still leave partial outputs; destination
controls do not make compilation atomic. Existing relative destinations retain
the previous publishing behavior of being replaced on publish.

## Compilation progress and output facts

Publishing shows the current library stage and whether it has started or
completed. There are twelve stages, from discovery through output; this is stage
progress, not a percentage or a guarantee that the next phase will succeed.

After a publish attempt, Output files shows the library's CSS, HTML, PDF and
embedded-HTML artifact facts when available:

- **Completed**: that artifact's write phase resolved in this invocation.
- **Not attempted**: this invocation did not start its write phase.
- **Completion unverified**: its write phase was attempted but did not resolve
  successfully; a file may be old, partial, newly written or missing.

These labels do not distinguish creation from replacement. Existing files can
remain after failed or unattempted writes. CSS can be Completed even when later
PDF generation fails. A worker crash/timeout may leave files without returning
artifact facts; the GUI does not invent a report for those files.

Completed document rows offer Reveal. Main selects a path from the last
validated artifact report and rechecks that it is a regular file. Unverified
and unattempted documents cannot be revealed through these controls. CSS has no
reveal action. The existing Reveal PDF toolbar action remains available after
successful publishing. A preview failure preserves the successful output report.

The protocol limits an artifact report to four unique known kinds, known phase
statuses and paths of at most 4,096 characters. Main matches every reported path
to that operation's authorized destinations, including templates/index.css.
Progress contains only known stage/status pairs, at most 24 ordered events.
The utility and main validate stage order; preload validates it again. Worker
job IDs and per-publish invocation IDs correlate messages, and closed/stale
sessions discard events. Preload installs a listener for just that invocation
and removes it on completion or failure. The renderer receives no IPC event,
process object, arbitrary subscription channel or filesystem path reveal API.
