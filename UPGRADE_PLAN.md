# Dependency and tooling upgrade plan

Prepared 21 October 2026. Steps 1–6 are implemented, with local macOS validation recorded. Hosted/Linux
validation and Dependabot operation remain pending.
See [validation](docs/validation.md) for evidence and historical security findings (current audits are clean).

This adapts the completed [library plan](../cross-doc/UPGRADE_PLAN.md) and
[CLI plan](../cross-doc-cli/UPGRADE_PLAN.md) to the Electron GUI. Use the
library's [public API](../cross-doc/docs/public-api.md) and
[Electron validation evidence](../cross-doc/docs/validation.md) as reference;
its consumer fixture does not replace testing the actual GUI.

## Recommended direction

Adopt the siblings' Node development baseline, pinned pnpm, strict TypeScript,
Oxlint, Oxfmt and Vitest. Upgrade Electron and React to supported stable
releases. Keep the existing Open, Refresh, category/entry checkbox selection
and Publish workflow, correcting its broken state and error handling.

Use native ESM for the Electron main entry and compilation utility process.
Bundle the React renderer for Chromium, with no Node dependencies. Expose a
small typed contextBridge API through a sandbox-compatible bundled CommonJS
preload (`.cjs`); this is an Electron boundary requirement, not a second
CommonJS application/library build. Sandboxed preloads cannot use ESM; see
[Electron's ESM documentation](https://www.electronjs.org/docs/latest/tutorial/esm)
and [sandbox documentation](https://www.electronjs.org/docs/latest/tutorial/sandbox).
Do not weaken sandboxing to make a uniform module format possible.

Move document loading/parsing and compilation to a Node-capable Electron
utility process so synchronous library operations cannot block the main
process or UI. Keep dialogs, window lifecycle and request authorization in
main. Consume cross-doc only through its public package root.

## Repository findings

- Three source files implement main, React UI and renderer bootstrap. There
  are no tests, TypeScript configuration, packaging configuration or CI.
- Electron is `^11.5.0`; React/ReactDOM are `^16.13.1`, PrimeReact `^4.2.1`,
  PrimeIcons `^4.0.0-rc.1`, and electron-pdf-window `^1.0.12`.
- Main uses `require('cross-doc')`, incompatible with the upgraded library's
  ESM-only exports. `type: "script"` is invalid and `main: "index.js"` points
  to a nonexistent entry.
- Start Babel-compiles into dist but launches `src/gui.js`. Main loads
  `../assets/index.html` relative to working directory; the bootstrap imports
  the generated App via a source-to-dist path. CSS loads from node_modules.
- Babel targets Electron 9, mentions `@babel/react` without declaring that
  preset, and enables core-js entry handling without an entry import. Replace
  this configuration rather than preserving its assumptions.
- The renderer has Node integration and remote enabled, directly imports
  ipcRenderer, and opens the directory dialog through `electron.remote`.
  There is no preload or explicit isolation/sandbox configuration. CSP allows
  inline scripts. IPC trusts renderer-supplied project/output options.
- A refresh listener is registered on every React render without cleanup.
  Options are a mutable module global with a hard-coded private project;
  changing project does not reset checkbox state reliably.
- Checkbox values include category keys as well as entry slugs; parent keys
  can therefore become invalid library include values. Empty selection and
  initial all-entry behavior are undefined.
- Both refresh and publish repeat compilation preparation. Publish adds
  title attributes before the TOC, contrary to the upgraded library helper.
  Output is awaited, but IPC handlers have no user-visible failure response.
- PDF display depends on an old Electron wrapper. The library's output call
  produces HTML, PDF and embedded HTML, so Publish is not a PDF-only operation.
- The sole lockfile is npm lockfile v1 and contains the old library tree.
  README installation and usage are provisional. No GUI audit was run for
  this plan; sibling audit counts must not be attributed to this repository.

## Version and dependency policy

The checked-in siblings pin Node 24.22.0, pnpm 12.14.0, TypeScript 7.0.2,
Oxlint 1.89.0, Oxfmt 0.74.0 and Vitest 5.0.5. The library tests Electron
45.0.0 with bundled Node 24.22.0. These are repository reference versions,
not independent claims about the latest registry releases.

Before implementation, query stable versions, engines, peer dependencies and
release/migration notes. Pin selected tools and Electron exactly and commit
resolved dependencies in pnpm-lock.yaml. Check the bundled Electron Node
version against cross-doc's minimum separately from development Node.

| Dependency              | Intended action                                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------ |
| cross-doc               | Retain `file:../cross-doc` for local development; build sibling first and reinstall after changes                  |
| electron                | Upgrade to current stable; move to development dependencies, ship its runtime in the packaged app                  |
| react / react-dom       | Upgrade together; adopt createRoot and matching React type packages                                                |
| primereact / primeicons | Select a supported stable compatible combination; migrate Toolbar, Button, Tree and theme assets together          |
| classnames              | Remove if still unused; otherwise declare and upgrade where directly used                                          |
| electron-pdf-window     | Remove; use a dedicated isolated BrowserWindow with Electron's PDF support, verified on target platforms           |
| Babel / ESLint tooling  | Replace with typed builds, Oxlint and Oxfmt                                                                        |
| Build / packaging tools | Add Vite for renderer assets, a small explicit preload bundling step, and Electron Forge for application packaging |
| Test tools              | Add Vitest, matching V8 coverage, React Testing Library and Playwright's Electron automation                       |

PrimeReact's themes and APIs have changed across majors. Review its
[migration guidance](https://github.com/primefaces/primereact/wiki/Migration-Guide-for-Templates)
and the selected release's documentation; do not assume the old rhea CSS
paths or checkbox value shape remain valid. Avoid adding a prerelease UI
line merely because its major number is higher.

## Ordered implementation batches

### 1. Establish reproducible installation and baseline contracts

Status: implemented. Node/pnpm pins, imported lockfile, npm enforcement and
reviewed build permissions are in place. Clean frozen installation and fixture
data checks pass; the application contract is documented. Legacy audit findings
remain assigned to subsequent batches; no working GUI is claimed.

- Pin development Node and pnpm following the siblings. Add engines,
  packageManager and devEngines.packageManager enforcement. Import the old
  lockfile with pnpm import before dependency changes, then remove
  package-lock.json. Review and allow only required dependency build scripts,
  including Electron's download; keep strict dependency resolution.
- Verify modern npm install/ci/run rejection in a disposable checkout with
  unchanged manifests/lockfiles. Document deliberate bypass/older npm limits.
  CI must reject additional package-manager lockfiles.
- Build the sibling before a clean frozen GUI install. Record full and
  production audit results for this application's resolved tree; installation
  success does not imply the legacy app can run with the new ESM library.
- Define the application contract and derive a small trusted fixture from
  the library's fixture. Record current intended behavior without requiring
  obsolete vulnerable Electron to run or preserving known defects.
- Specify no project at launch; Open cancellation leaves state unchanged.
  A selected project gets absolute output paths under its own out directory,
  preserving the existing `auto` basename and A5 default unless deliberately
  revised. No private checkout or invocation-cwd dependency may remain.
- Define initial selection as all entries. Category checkboxes select only
  their descendant entry slugs; deselecting everything disables Publish.
  Omit include for all entries; never send category IDs, null or an ambiguous
  empty selection to the library. Reset selection on project change and
  reconcile surviving slugs on refresh.

### 2. Replace the build and convert to strict TypeScript

Status: implemented. Strict TypeScript 7 emits main ESM; Vite bundles the React
19 renderer/assets and esbuild emits a single sandbox-compatible preload.
Electron 45 replaces Electron 11, Babel/ESLint and the obsolete PDF wrapper are
removed, and Oxlint/Oxfmt/Vitest checks are configured. PrimeReact uses the
maintained v10 stable line with a declaration-only React 19 patch, documented
in [tooling](docs/tooling.md). Main-owned dialog/typed compiler and a minimal
bridge were brought forward to make the converted renderer usable; compilation
still runs in main. Utility-process execution/full IPC validation remain step
3; those steps and the Prince/preview work are now completed below. See [validation](docs/validation.md).

- Set type to module and main to the compiled Electron entry. Use separate
  TypeScript configurations for Node-capable code and browser renderer code,
  plus shared serializable IPC types. Enable strict checking, checked indexed
  access and exact optional properties without broad any/suppression escapes.
- Emit main/utility ESM with NodeNext, explicit .js imports and node: built-ins.
  Build TSX, styles, fonts and icons into local renderer assets with Vite;
  bundle preload into one sandbox-compatible .cjs file. Type-check separately
  from bundling. Do not bundle cross-doc into browser code.
- Resolve preload, renderer and worker paths from module/application resource
  locations rather than process.cwd(). Start must build and launch the compiled
  application. Clean output first so obsolete Babel files cannot ship.
- Replace ReactDOM.render with createRoot and migrate the three UI components
  and theme assets. Use React state for project, entries, selection, operation
  status and errors; remove renderer Electron imports and module-global options.
- Remove Babel and legacy ESLint configuration/dependencies after the new build
  passes. Add build/start/typecheck, test/watch/coverage, lint/lint:fix and
  format/format:check scripts; follow sibling formatting conventions.

### 3. Introduce the isolated Electron process boundary

Status: implemented. Main owns native selection, canonical project/output paths
and validated session state. A sandboxed preload exposes three bounded promise
operations; document work runs in a correlated, one-job ESM utility process.
Startup/fatal/crash/timeout failures reject, ordinary retry creates a fresh
worker, and reload/window/app lifecycle closes old sessions and discards stale
results. Real Electron checks cover worker crash recovery, main responsiveness,
concurrency rejection, unauthorized IPC, fake-Prince publishing and reload
cleanup. Prince configuration/preview are completed in step 4 below. See [validation](docs/validation.md).

- Explicitly set nodeIntegration false, contextIsolation true and sandbox true.
  Remove remote entirely. Keep the preload narrow: chooseProject, refresh and
  publish operations, plus a filtered progress subscription only if needed.
  Never expose raw ipcRenderer, arbitrary channel invocation, filesystem APIs,
  executable paths or cross-doc itself. Follow
  [Electron's security checklist](https://www.electronjs.org/docs/latest/tutorial/security).
- Main owns directory selection and normalized project/output configuration.
  Validate sender window/frame, payload shape and size, selected project,
  theme, known slugs and active operation on every request. Renderer supplies
  application choices, not arbitrary read/write paths or command execution.
- Return serializable entry summaries (slug, title, category) and categories,
  not whole parsed documents, Cheerio objects or unnecessary source HTML.
  Render titles as text. Define structured success/error results and request
  IDs; TypeScript types alone do not validate IPC input.
- Run document work in a utility process with correlated requests and bounded
  concurrency. Handle startup errors, abnormal exits and application shutdown;
  reject pending work and permit retry. Disable overlapping conflicting writes.
  Ignore stale refresh/publish results after a project switch or window close.
- Use promise request/response operations to avoid accumulating refresh
  listeners; any progress subscriptions must unsubscribe on unmount. Verify
  behavior under React StrictMode.
- Restrict navigation/window creation and external URLs. Use a production CSP
  with local script/style/font assets and no unsafe-inline scripts or eval;
  accommodate the selected UI library's actual style requirements explicitly.

### 4. Connect the upgraded compiler and PDF preview

Status: implemented. Refresh/publish share typed public-API preparation and the
correct TOC/title ordering. Main resolves or natively selects/persists Prince,
passes its absolute path through the utility, and opens an isolated built-in
PDF viewer only after all output succeeds. Preview failure preserves compile
success and offers a narrow Reveal PDF action. Fixture, failure, configuration,
UI and actual Electron/Prince checks pass locally; four rendered pages and the
viewer were inspected. See [publishing](docs/publishing.md) and
[validation](docs/validation.md). Packaged/ASAR/platform verification remains step 5.

- Share one typed preparation pipeline for refresh and publish. Import public
  cross-doc operations/types only. Follow read/parse/clean/enhance/link-check/
  sort and generate/replace/TOC/title/output ordering; await all async output.
  Validate categories using the library's supported behavior rather than a
  renderer-side unchecked cast. Do not add graph generation incidentally.
- Preserve selected-slug semantics, A5 theme and all three output files.
  Surface useful errors for invalid projects, categories, YAML, metadata,
  includes, themes/assets, unwritable output and Prince failures. Keep the UI
  responsive, show busy/success/failure state and expose a retry action.
- Retain external Prince installation/licensing. Resolve PATH consistently
  when launched from a desktop app; provide a main-owned native executable
  chooser/configuration when PATH is insufficient. Pass prince_binary through
  the public output options; never use a shell or renderer-chosen command.
- Open a dedicated PDF window only after successful completion, using a
  main-owned generated PDF path, no application preload and no Node access.
  Test Electron's built-in viewer for the exact selected release and packaging
  targets before removing the wrapper. Report preview failure separately from
  successful compilation and offer to reveal/open the generated file through
  a narrowly authorized main action if the viewer is unavailable.
- Keep compilation failures visible and describe possible partial artifacts;
  the library does not provide an atomic multi-file transaction. Projects with
  Markdown/raw HTML, templates and SCSS remain trusted input. A utility process
  keeps work responsive but does not sandbox Sass/Prince filesystem access.

### 5. Package and validate the real desktop application

Status: implemented locally on macOS arm64. Forge produces a standalone ASAR
application and unsigned ZIP with a portable production dependency tree. The
extracted ZIP passes actual Electron/utility compilation, selection, isolation,
Prince failure/configuration, real PDF preview and macOS activation checks.
Both audits are clean. macOS/Linux Node 24/26 CI is configured; hosted execution
and Linux results remain pending. See [packaging](docs/packaging.md) and
[validation](docs/validation.md).

- Configure Forge to package compiled app assets and the production cross-doc
  dependency tree. Preserve the sibling file dependency in source, but ensure
  the distributable contains the built library and all runtime dependencies;
  it must not retain links requiring ../cross-doc or the pnpm store.
- Test a packaged ASAR layout. Keep projects/output and the external Prince
  executable on real filesystem paths; unpack dependencies/resources requiring
  native access. Reuse the library fixture's proven layout where appropriate,
  without assuming every dependency can execute inside ASAR.
- Add unit tests for path/selection normalization, request validation, stale
  response handling and pipeline failures. Use component tests for Open cancel,
  tree parent/leaf selection, project changes, progress and errors.
- Use real Electron automation for renderer isolation, dialogs via controlled
  test seams, IPC rejection, refresh/publish, utility-process crash recovery,
  repeated renders and window lifecycle. Verify the renderer cannot access
  require/process/filesystem or invoke arbitrary IPC. Do not disable Chromium's
  sandbox to make tests pass.
- Use fake Prince for repeatable invocation/nonzero/timeout tests and inspect
  actual HTML/embedded output against reviewed fixture expectations. Keep an
  opt-in real-Prince test for PDF text/page count, layout and viewer behavior.
  Fake PDF output cannot establish that the PDF viewer works.
- Launch the packaged application outside the repository with a different cwd,
  no sibling checkout, no build tools and no development server. Exercise spaces,
  Unicode paths, refresh, selected-entry publish, missing Prince and preview.
  Verify macOS activation/reopening and non-macOS last-window shutdown.
- Run frozen installs and checks on development Node 24/26, plus actual pinned
  Electron tests. Start with macOS/Linux (Xvfb on Linux) matching sibling CI;
  claim Windows support only after equivalent packaged/path/Prince validation.
  Test distributable launch, not just Forge's development mode.
- Re-run full and production audits including Electron, build and packaging
  tools. Resolve findings through supported upgrades/replacements; record any
  residual dependency path, reachability and remediation. Do not use forced
  audit fixes or claim completion with unresolved security findings.

### 6. Document operation and automate maintenance

Status: implemented. README and linked operational/architecture/packaging guides
cover the final application. Weekly latest-sibling compatibility checks and an
independent committed-lockfile audit job are configured, alongside weekly
Dependabot dependency/action updates. Both audits run even if one fails. The
reviewed unsigned macOS artifact is available from stage 5. Hosted schedules,
Linux execution and Dependabot PR generation require verification after merge;
see [maintenance](docs/maintenance.md) and [validation](docs/validation.md).

- Replace README placeholders with development setup, sibling build/install
  order, desktop build/launch instructions, supported OS/runtime versions,
  Open/Refresh/selection/Publish behavior, output locations and Prince setup.
  Include a usable public fixture and explain the trusted-project boundary.
- Document the preload exception to ESM, process ownership, IPC contract,
  packaging/resource layout and pnpm build permissions. Record local checks,
  real-PDF evidence and any pending hosted CI separately in docs/validation.md.
- Add sole-lockfile/package-manager checks, frozen-install CI, scheduled full
  and production audits and dependency-update automation. Follow the CLI's
  latest-sibling-master compatibility CI policy and record the resolved SHA;
  do not silently fall back to an older library when compatibility breaks.
- Produce reviewable local desktop artifacts. Signing, notarization, release
  publishing and auto-update infrastructure require their own configured
  credentials/distribution decisions and are not prerequisites for this upgrade.

## Completion criteria

A packaged GUI runs independently of the source checkouts, loads a selected
project, refreshes a correctly grouped tree and publishes exactly the chosen
entry slugs through the upgraded public ESM API. Compilation stays responsive,
all output is awaited, failures are actionable, and a real PDF can be viewed.
The renderer is sandboxed and isolated behind validated narrow IPC; no remote,
Node integration or arbitrary filesystem/process bridge remains. Strict types,
lint, formatting, fixture, Electron and packaged-app checks pass on declared
platforms. pnpm is pinned with a sole lockfile and both audits are clean.
Real-PDF, hosted CI and distribution validation are reported accurately rather
than inferred from mocks or the sibling library's results.
