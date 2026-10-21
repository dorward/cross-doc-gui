# Application contract

This describes the GUI behavior implemented in upgrade batches 2–4.
See [publishing](publishing.md) for Prince configuration, preview and recovery.

- Launch with no selected project and an empty tree. Refresh and Publish are
  disabled until a project is open. Never load a developer's private checkout.
- Open uses a native directory chooser. Cancelling preserves the current
  project, tree and selection. A successful project change resets selection
  and loads the new project's entries and category headings.
- Use an absolute selected project path. Default outputs are
  `<project>/out/auto.html`, `auto.pdf` and `auto-complete.html`; preserve the A5
  theme default when present, otherwise choose the first sorted project theme.
  A dropdown before Publish lists theme directories containing index.scss; no
  themes means a tooltip warning and disabled Publish. Paths do not depend on the launch working directory. The
  fixture's A5 theme is an alias copy of its minimal default theme.
- Settings exposes an output basename and independent HTML/PDF/embedded-HTML
  overrides. Relative paths resolve from the project; external destinations
  require a main-owned native save dialog. Configuration survives refresh and
  reopening the same project, resets on project change, and is not persisted
  across app restart/reload. Invalid settings or cancelled native selection
  retain the previous configuration. Publish, preview and reveal use main-owned
  expected paths; the renderer cannot supply paths in a publish request.
- Initially select all entries. Category checkboxes select descendant entry
  slugs only; category IDs never become compiler include values. Partially
  selected categories reflect their descendants. All-entry compilation omits
  include; a subset sends nonempty, unique known entry slugs. Selecting nothing
  disables Publish rather than accidentally compiling everything.
- Refresh reloads the project, retains selected surviving slugs and removes
  deleted slugs. If all entries were selected, continue selecting all entries,
  including new ones. A project change resets to all entries. An empty project
  has no publishable selection.
- Publish awaits HTML, PDF and embedded HTML output before reporting success
  or opening preview. It uses the shared public library pipeline, adding the
  TOC before title attributes. Do not activate graph generation incidentally.
- Show validated compilation stage progress and conservative artifact phase
  results. Reveal completed documents by kind through main-owned paths; keep
  unverified/unattempted output actions disabled. Preview failure retains the
  completed artifact report.
- Show operation progress and actionable errors; prevent conflicting output
  jobs. Discard stale results after project changes. Failed refresh does not
  replace valid displayed data; mark it stale and disable Publish until a
  successful refresh. Permit retry after failure.
- Missing/invalid input, themes/assets, unwritable output and Prince failures
  are visible errors, not successful empty results. A late PDF failure may
  leave HTML/CSS artifacts. A preview failure is separate from compilation
  success and must not discard the generated file.
- Main owns chosen paths and native dialogs; the renderer sends choices through
  validated narrow IPC. The compiler runs in a utility process. This protects
  renderer privileges and responsiveness, not untrusted project execution:
  Markdown/raw HTML, templates and SCSS remain trusted inputs, and Sass/Prince
  local filesystem access is not sandboxed by the library.

## Appearance

Settings exposes Light, Dark and System color modes before a project is opened
and without Prince. System is the default and follows live OS changes. Explicit
Light/Dark choices override the system for application controls and native
windows/dialogs. Main persists the preference in appearance.json under userData
and applies it before creating the first window. Missing/invalid preferences
recover to System. Save failures retain the last applied preference and display
an error. Preferences survive project changes, renderer reload and app restart.

The renderer uses the bundled PrimeReact Lara light/dark palettes, including
portalled dialogs, form controls, toolbars and trees. Body colors, alerts,
attention markers and table borders follow the resolved palette. Appearance
does not change the selected project theme or generated documents.

## Help and About

The native Help menu works before selecting a project and without Prince.
Cross-Doc Help covers project requirements, Prince installation/selection and
entry/theme selection. Separate short topics cover warning meanings, output
destinations and non-atomic publishing/preview recovery. About Cross-Doc shows
the version read from the application's package metadata in main. macOS also
provides About in the application menu. Standard edit/view/window controls
remain available. Help does not launch compilation or use external URLs, and
adds no renderer bridge methods.

## Trusted fixture

`tests/fixtures/project` is copied from the upgraded library's trusted fixture,
with an A5 copy of its default SCSS for the GUI's default theme. It contains
people, chronological events, reciprocal links, aliases, dates, character-sheet
metadata, a template and an embedded SVG. It is synthetic and safe to modify
in a temporary directory. Never write generated output into the committed
fixture. Later tests must inspect tree/selection behavior and actual generated
content rather than merely checking file existence. Fake Prince can test process
handling but does not establish real PDF layout or preview compatibility.
