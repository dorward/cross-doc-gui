# Step 1: reproducible installation and application contract

Validated locally on 21 October 2026 with Node 24.22.0, pnpm 12.14.0
and npm 11.17.0. Initial import and sibling build used Node 26.5.0.

- Imported npm lockfile v1 with pnpm import before changing dependency ranges;
  removed package-lock.json afterwards. Existing application dependency ranges
  and locked legacy releases are retained. The local cross-doc dependency now
  resolves the upgraded sibling's actual tree.
- Built cross-doc successfully before installation. A final clean installation
  under pinned Node 24.22.0 passed with --frozen-lockfile and left pnpm-lock.yaml
  byte-for-byte unchanged. The public ESM import exposes all 14 operations.
- Pinned pnpm 12.14.0 and Node 24.22.0 were confirmed through registry metadata.
  The global pnpm executable reports 12.14.0 for --version but executed initial
  commands as 12.6.0; validation therefore used a temporary installation of
  pnpm 12.14.0 and Node 24.22.0. The first import used the global executable;
  subsequent resolution-policy and frozen checks used the pinned version.
- Installation scripts are explicitly reviewed: Electron's binary downloader
  is allowed; core-js's informational postinstall, the optional legacy fsevents
  native build and Sass's optional @parcel/watcher build are denied. Strict
  build-script review remains enabled. The release-age exception for Sass
  matches the sibling's already-reviewed exact version; no broad bypass exists.
- check:package-manager passes through pinned pnpm. A disposable checkout
  rejected npm install, npm ci, npm run start and npm run check:package-manager
  with EBADDEVENGINES naming pnpm. File hashes remained identical after every
  rejected command; no node_modules or second lockfile was created. Separate
  checks rejected a wrong pnpm user-agent and an added npm lockfile.
- Under Node 24.22.0 the installed public library read, parsed, enhanced and
  sorted all four trusted fixture entries (alice, bob, departure, arrival).
  Fixture contents match the library fixture, with a copied A5 theme added.
  This is a data/API smoke check, not GUI, compilation or real-PDF validation.
- Full and production audits completed and exited nonzero for known findings:

| Scope      | Critical | High | Moderate | Low | Total |
| ---------- | -------: | ---: | -------: | --: | ----: |
| Full       |        3 |   45 |       42 |  11 |   101 |
| Production |        2 |   19 |       31 |   8 |    60 |

These are advisory findings, not unique package counts or demonstrated exploit
counts. [The security baseline](security-baseline.json) records every reported
advisory, severity, URL and resolved dependency path for both scopes.

Electron accounts for 46 advisories in each scope. Its legacy downloader and
PDF wrapper also introduce got, extract-zip and related paths. Upgrade Electron
in batch 2 and remove electron-pdf-window in batch 4. Babel/ESLint introduce
remaining development findings, including @babel/traverse and old glob/parser
utilities; replace that tooling in batch 2. React/UI transitive runtime trees
also require supported upgrades in batch 2. Review every recorded path again
after those changes; moving Electron to devDependencies alone does not remove
its risk in the distributed desktop application. No forced audit fix was used.

The legacy application is still incompatible with the upgraded library's ESM
contract and still has its old renderer privileges. No launch, automated GUI
suite, output generation, PDF preview, package or hosted CI success is claimed.
The intended behavior is specified in [application-contract.md](application-contract.md).
Step 1 establishes a baseline; it does not complete the security migration.

## Step 2: strict TypeScript and desktop build

Validated locally on 21 October 2026. Registry metadata confirmed Electron
45.0.0, React/ReactDOM 19.3.1, TypeScript 7.0.2, Vite 8.3.5, esbuild 0.28.2,
Oxlint 1.89.0, Oxfmt 0.74.0 and Vitest/V8 coverage 5.0.5. PrimeReact's stable
v10 channel is 10.9.9 with React 19 peers; see [tooling](tooling.md) for the
v11 declaration failure and the reviewed, declaration-only v10 compatibility
patch. No skipLibCheck, broad any types, global JSX shim or suppression directives
were added. Pinned pnpm now runs correctly from the normal user installation.

- Clean frozen installation under Node 24.22.0 passes and preserves the exact
  lockfile hash. The patched declarations apply reproducibly on a fresh install.
  Application/library production dependencies and Electron/build tools are
  explicitly separated in the manifest.
- Main-process and browser TypeScript configurations pass strict checking.
  Production builds pass under Node 24.22.0 and 26.5.0, emitting main ESM,
  bundled preload CJS and local renderer HTML/JS/CSS/fonts/icons. No Babel,
  ESLint, renderer require, remote or source-to-dist import remains.
- Eight routine React/selection tests pass on both Node lines, including
  StrictMode rendering, category/leaf selection, all/subset/empty selection,
  Open cancel/project change, refresh failure/retry and overlapping actions.
  V8 coverage measures only App/selection: 96.55% statements, 86.53% branches,
  96.77% functions and 98.7% lines. These figures are not whole-app coverage.
- The actual Electron 45.0.0 / bundled Node 24.22.0 application loads from an
  unrelated temporary cwd, mounts React and its styles, uses the bundled
  preload and returns fixture summaries through IPC. Open updates React state
  with People/Events and enables Publish. Cancellation preserves the project.
  Renderer require/process are unavailable and the API exposes only
  chooseProject/refresh/publish. Sandbox/context isolation are enabled and Node
  integration is disabled. The test replaces the native chooser only, not the
  compiler or library. Startup readiness is scheduled after ESM evaluation to
  avoid an Electron startup deadlock. No sandbox-disabling flags were used.
- Oxlint, Oxfmt, package-manager enforcement and git diff whitespace checks
  pass. The original step-1 audit report remains historical evidence.
- Final full and production audits report **zero findings**. An intermediate
  low-severity debug finding in Electron's downloader/checksum tree was resolved
  with `pnpm update debug --depth 10` within supported parent ranges, without
  an override or forced audit fix. whatwg-encoding retains an informational
  deprecation warning; it is not an unresolved audit finding.

The typed migration brings forward minimal main-owned dialog/compiler/bridge
wiring to make the renderer usable on modern Electron. Compilation still runs
in main and can block on large projects; utility-process execution, bounded IPC
validation and comprehensive lifecycle/security tests remain batch 3. Publish
currently reports its generated PDF path without opening a viewer. External
Prince configuration, PDF preview/fallback and real PDF/output regression checks
remain batch 4. electron-pdf-window was removed early with the obsolete tree.
No real PDF, packaged desktop distribution, Linux/Windows or hosted CI validation
is claimed in step 2. Existing fixture files have not been compiled in place.

## Step 3: isolated Electron process boundary

Validated locally on 21 October 2026 with Node 24.22.0/26.5.0, pnpm 12.14.0,
TypeScript 7.0.2 and actual Electron 45.0.0 / bundled Node 24.22.0:

- Main no longer imports the document compiler or cross-doc. Native ESM utility
  code performs refresh/publish through the public library API, returning only
  serializable summaries or the expected output path. The single CJS preload
  still bundles cleanly for the sandbox; no raw Electron/IPC channel API is
  exposed to browser code.
- Main validates exact window, main frame and document URL, method argument
  count, session state and unique known include slugs. Paths come only from
  the native chooser and are canonicalized. Extra paths/options, category IDs,
  unknown/duplicate/empty selections and oversized values are rejected. The
  preload validates selections and responses independently. Array, text and
  aggregate-message limits are described in [tooling](tooling.md).
- Jobs have UUIDs and a ready handshake. Only one compiler process may be live
  across window/session replacements; completion waits for exit before releasing
  the slot. Ordinary crashes/fatal errors, startup failure, timeouts and malformed
  replies reject pending work. Retry forks a fresh process. A failed termination
  has a bounded failure response and requires application restart, preventing
  accidental overlapping workers.
- Session close on reload, renderer crash, window close or quit invalidates old
  work and stops its worker. Main rechecks session validity after asynchronous
  work; renderer mount-generation checks ignore late completions. Failed refresh
  also marks the main-owned project stale until successful refresh, so bypassing
  a disabled UI button cannot publish stale data.
- Navigation, popup windows, webview attachment and permission requests/checks
  are denied. Renderer sandbox/context isolation and disabled Node integration
  remain explicit. CSP disallows inline scripts/eval and external connections;
  the documented PrimeReact inline-style allowance is unchanged.
- All **32 routine tests pass on Node 24 and 26**, covering IPC/message guards,
  size limits, project state, stale results, process correlation, concurrency,
  startup/crash/fatal/timeout/termination failure, retries and the React workflow.
  Coverage now includes boundary helpers as well as renderer adapters: 92.85%
  statements, 83.41% branches, 94.8% functions and 95.78% lines. Electron entry,
  preload wiring and real compiler execution are exercised separately by the
  integration check, not included in those coverage percentages.
- Actual Electron tests pass from an unrelated temporary cwd. They exercise
  real utility refresh and all/subset publishing using a temporary project and
  fake Prince executable, inspecting HTML selection and embedded SVG content.
  Fake renderer failure propagates through utility/main/preload. The fixture's
  subset-link warning is expected and remains a terminal diagnostic.
- The integration harness kills a real worker at startup, verifies failure and
  successful retry, rejects simultaneous refreshes, and confirms main continues
  ticking while a worker performs CPU-bound work before loading the real
  compiler. An unrelated sandboxed window cannot invoke app IPC. Reload while
  work is pending terminates the worker and clears the selected project. The
  harness supplies only test-side dialog/launcher seams; production has no
  crash/sleep/test control channel and never disables Chromium sandboxing.
- Frozen installation, strict type checks, production build, Oxlint, Oxfmt and
  whitespace checks pass. No dependency/lockfile change was needed; the zero-
  finding full/production audit baseline from step 2 is unchanged.

PDF bytes in these integration checks are an explicit fake-process marker:
no real PDF layout or viewer validation is claimed. Prince configuration and
PDF preview/fallback remain step 4, packaging and hosted/platform CI later.
Utility-process separation improves responsiveness and renderer privilege
isolation but does not sandbox trusted Sass/Prince input. Interrupted output
can be partial; worker termination is neither rollback nor guaranteed immediate
termination of an already spawned Prince subprocess. The library retains its
30-second executable timeout. No new UI cancellation feature is introduced.

## Step 4: Prince configuration, compilation and PDF preview

Validated locally on 21 October 2026 using Node 24.22.0/26.5.0, Electron 45.0.0
(bundled Node 24.22.0), Prince 17 and Poppler on macOS:

- Native Choose Prince validates/canonicalizes an executable and persists it in
  the app's userData settings. Cancellation preserves the setting; stale or bad
  saved settings produce an instruction to select again. Tests cover spaces in
  executable paths, PATH discovery and nonexecutable/directory rejection. The
  installed Prince was also resolved with an empty desktop PATH using macOS's
  standard installation directories, without executing a login shell.
- Main passes only its resolved absolute Prince executable through the internal
  utility protocol. Renderer publish input remains limited to known include
  slugs; new choosePrince/revealPdf methods accept no paths or command arguments.
  Output is awaited through the public library API with TOC before title
  attributes and all three files retained. The shared preparation adapter is
  unchanged apart from Prince pass-through.
- **45 routine tests pass on Node 24 and 26**, with one separately selected
  timeout test skipped by default. The compiler's complete HTML matches the
  committed, reviewed sibling baseline byte-for-byte, and embedded SVG content
  is checked. Cases cover malformed YAML, metadata/categories, missing input,
  missing themes/assets, blocked output directories, missing/nonzero Prince,
  configuration persistence, partial artifacts and preview/reveal UI state.
- The opt-in real executable timeout test passes in approximately 30 seconds,
  using a live fake Prince process rather than a mocked timer. The library's
  timeout failure propagates through the compiler adapter. The separate worker
  timeout/lifecycle tests from step 3 remain passing.
- Actual Electron IPC smoke tests pass with a fake Prince: fake PDF bytes cause
  a preview failure while compilation remains successful. Reveal is limited to
  the saved main-owned path; native configuration persists through the normal
  settings service. OS reveal/dialog actions are captured by test-side seams.
- The real-Prince Electron test passes. A native chooser selects the actual
  executable, the real utility writes all output, and a dedicated BrowserWindow
  loads the generated PDF through Chromium's built-in viewer extension. The
  preview has sandbox/context isolation on, Node integration off and no app
  preload or crossDoc bridge. A forced preview-renderer crash closes preview,
  reports that the PDF remains saved and leaves Reveal PDF working.
- Poppler confirms four fixture pages and expected document text. All four
  pages were rendered to PNG and visually reviewed along with the actual
  Electron viewer screenshot. Headings, map, character sheet and timeline are
  legible without clipping/overlap; the minimal fixture's existing typography,
  pagination and Prince non-commercial logo are retained. The fixture's A5
  theme alias intentionally uses A4 SCSS, as documented in publishing.md.
- Strict types, production build, Oxlint, Oxfmt and whitespace checks pass. No
  runtime/development dependency versions or lockfile changed. Expanded coverage
  includes settings/compiler helpers: 88.86% statements, 75% branches, 91.34%
  functions and 91.8% lines. The separate Electron preview tests are not counted
  in these Vitest percentages. The step-2 zero-finding audit baseline remains
  unchanged; no new dependency tree was introduced.

Preview checks verify the current development Electron release on macOS.
Packaged/ASAR resource paths and Linux/Windows GUI claims remain batch 5, and
hosted CI has not been run here. Generated review files live outside the
repository and tests use temporary project copies. Publish still is not an
atomic multi-file transaction, and trusted Sass/Prince filesystem access is not
sandboxed. See [publishing](publishing.md) for user operation and test commands.

## Step 5: standalone desktop packaging and CI

Validated locally on 21 October 2026 on macOS arm64. Added exact Forge
CLI/core/ZIP maker 8.0.1, ASAR 4.3.1 and Playwright 1.64.1 development tools.

- Node 24.22.0 frozen installation, package-manager enforcement, strict types,
  Oxlint, formatting and build pass. All 45 routine tests pass on Node 24.22.0
  and installed Node 26.5.0, with the opt-in timeout case skipped. Coverage
  remains 88.86% statements, 75% branches, 91.34% functions and 91.8% lines;
  packaged/Electron automation is separate from these Vitest figures.
- Forge creates a standalone compiled ASAR application and unsigned host ZIP.
  The source keeps its sibling file dependency; staged production dependencies
  and library are deployed beside ASAR with relative, verified internal links.
  Attempts to place the pnpm graph inside ASAR failed real utility dependency
  resolution; extra-resource copying also produced absolute temporary links.
  Both failures were corrected before the successful relocated launch. The
  after-copy hook repairs/verifies links before the maker runs, and packaging
  removes its temporary deployment directory.
- The extracted ZIP launches from a temporary Unicode/space path and unrelated
  cwd with development environment removed and a restricted system PATH. ASAR
  inspection excludes source/tests/build tools and the shipped manifest contains
  no sibling file dependency or development scripts. Every packaged symlink is
  checked for a real internal target. The actual application needs no source
  checkout, pnpm store, system Node or development server.
- Playwright launches the packaged executable and exercises native chooser
  seams, actual renderer controls, utility refresh, all/subset compilation,
  byte-for-byte reviewed HTML, embedded SVG, missing/selected/nonzero Prince,
  persisted configuration, reveal and macOS close/activation/reopen. Renderer
  require/process are unavailable and the bridge exposes only its five methods.
  The relocated app passes real Prince 17 publishing, Poppler four-page/text
  checks and isolated built-in PDF preview. Stage-4 visual layout evidence still
  applies; this run adds packaged resource-path and viewer validation.
- The real development Electron smoke suite also passes, retaining IPC denial,
  worker crash/retry, concurrency, heartbeat and reload checks. All generated
  projects/settings are temporary. Chromium sandboxing remains enabled; there
  are no production test control channels.
- Full and production audits after frozen installation both report **zero
  findings**, including the newly added packaging/automation graph. No forced
  fixes or dependency overrides were used. The informational whatwg-encoding
  deprecation warning remains.
- CI YAML parses and pinned action revisions were verified against official
  repositories. The workflow targets macOS/Linux on Node 24.22.0 and 26.12.0,
  checks the latest sibling master and records its SHA, then runs frozen checks,
  actual Electron, extracted ZIP launch and both audits. Linux uses Xvfb with
  Chromium's namespace sandbox. An optional self-hosted desktop/Prince job adds
  real PDF and executable-timeout checks. Hosted execution, Linux lifecycle and
  Linux PDF viewing remain pending; no Windows support is claimed.

The review artifact is
`out/make/zip/darwin/arm64/Cross-Doc-darwin-arm64-0.0.1.zip` (about 155 MiB).
It is unsigned and not notarized or published. See [packaging](packaging.md)
for regeneration and verification. Scheduled audits/dependency maintenance and
final operational documentation remain batch 6.

## Step 6: operation and ongoing maintenance

Implemented and checked locally on 21 October 2026:

- README now documents final Open/Refresh/selection/Publish behavior, the three
  output filenames, Prince setup, developer/end-user runtime distinction and
  validated/pending platform boundaries. Linked tooling, publishing, packaging
  and maintenance guides cover process ownership, the CJS preload exception,
  bounded IPC, dependency build permissions and distribution checks.
- Weekly Monday 07:37 UTC validation tracks latest sibling master and logs its
  SHA. A separate scheduled/manual audit job requires no dependency installation
  or sibling checkout. Both full and production audits run with explicit outcome
  aggregation, so either failure fails the job without suppressing the other.
- Dependabot is configured for weekly Monday 07:00 Europe/London registry and
  GitHub Actions updates, grouping production/development minor/patch updates
  and excluding the intentional local cross-doc dependency. No auto-merge is
  configured. The maintenance guide documents coupled versions, PrimeReact
  patch review and Electron/packaged/PDF validation for upgrades.
- Both YAML files parse. Local assertions check scheduling, independent audit
  steps, outcome aggregation, latest-master checkout and Dependabot exclusions.
  The package-manager script was exercised in a disposable directory without
  node_modules: exact pnpm succeeds, npm/wrong pnpm versions fail, and each of
  package-lock.json, npm-shrinkwrap.json and yarn.lock is rejected.
- Package-manager enforcement, Oxlint, Oxfmt and whitespace checks pass with
  the pinned Node 24.22.0/pnpm 12.14.0 toolchain. Full and production audits both
  report **zero findings**. No dependency versions, lockfile or application
  code changed; stage-5 routine/Electron/packaged/PDF evidence remains applicable.

All six implementation batches are in place. Hosted CI/schedule execution,
Linux results and Dependabot PR generation remain pending until the files reach
GitHub's default branch. The unsigned macOS ZIP from stage 5 remains the tested
review artifact; it was not rebuilt for documentation/workflow-only changes.
Signing, notarization, release publishing and auto-update infrastructure remain
separate distribution decisions.

## Settings dialog and Prince attention indicator

The toolbar now has an icon-only pi-cog Settings action on its right. Prince
configuration lives in its modal dialog, showing the resolved executable path
or an attention message. A red corner dot marks unavailable Prince settings.
The new no-argument getPrince bridge operation uses the same main-owned resolver
as publishing, with exact sender/frame authorization and response validation.
Without an override, existing PATH discovery is retained. Native executable
selection, validation, cancellation and persistence are unchanged.

Local macOS checks pass: 46 routine tests (one opt-in timeout skipped), strict
types, Oxlint, Oxfmt and the actual Electron integration suite. Settings tests
cover icon-only presentation, missing Prince, resolved path, native selection,
cancellation and clearing attention after configuration. The toolbar and dialog
were visually inspected from real Electron screenshots. The rebuilt extracted
macOS arm64 ZIP passes the settings attention/chooser flow, standalone compile,
isolation/lifecycle checks and actual Prince PDF generation/preview. No
additional dependencies or lockfile changes were needed.

## Project theme selection

Themes are discovered in the utility process from immediate template directories
containing index.scss, included in bounded/validated project snapshots and shown
in a dropdown before Publish. A5 is preferred initially, otherwise the first
sorted theme; refresh retains a surviving selection and project changes reset it.
Main validates against its known project themes, and the utility checks current
availability before generating output. Traversal/unknown theme values fail.
Projects without themes still open/refresh, showing a warning tooltip and
preventing publishing through both UI and main. The tooltip supports hover and
focus, with a passthrough correction for PrimeReact's reversed aria-hidden flag.

Local checks pass: 53 routine tests, strict types, lint/formatting, real Electron
smoke, and extracted macOS ZIP tests including alternate-theme selection,
refresh retention, the no-themes tooltip and main-process rejection. Real Prince
PDF generation/preview also passes. Compiler tests confirm the selected theme's
stylesheet is used. Real Electron screenshots of the selector and warning were
visually inspected. No dependencies or lockfile changed.

## Electron development hot reloading

Added `pnpm dev` using Vite 8 and exact @vitejs/plugin-react 6.1.2. Shared
build helpers keep the browser import boundary and Node/preload build aligned
with production. React Fast Refresh preserves compatible component state and
CSS updates in place; main/preload/shared/utility edits stop and rebuild the
Electron application before restarting it, resetting the selected project.

The real Electron development check passes: open fixture, select another theme,
edit/restore React heading and observe the new UI with the same process,
project and theme, then edit/restore main code and observe a fresh process.
Sandbox/context isolation remain enabled and renderer Node integration disabled.
Production build and real Electron smoke checks also pass. All 53 routine tests,
Oxlint and both audits pass; the latter report zero findings. CI now includes
the development integration check on its existing macOS/Linux matrix, with
hosted execution pending. Tests use temporary user data and restore source edits.

Only development-served HTML permits inline refresh setup and local WebSockets.
Production HTML/CSP remains unchanged. Main accepts the development URL only
when unpackaged and only on HTTP 127.0.0.1 with a port and root path. IPC still
requires the exact trusted document/window/frame. See tooling.md for startup,
restart behavior, type checks and cleanup.

The rebuilt extracted macOS ZIP also passes its standalone integration suite
with an intentionally unreachable development URL inherited in its environment,
confirming packaged execution still uses the built local renderer.

## Shared library pipeline migration

Refresh now uses cross-doc loadProject without output writes or Prince;
publishing delegates to compileProject and returns its completed PDF artifact.
GUI defaults, theme discovery, bounded snapshots, IPC/session/worker ownership,
Prince settings and preview remain in the application. Existing explicit-selection
regressions are retained. New full/subset tests compare output bytes to direct
shared compilation for identical project/theme/path options.

Types, lint and all 61 routine tests pass. Actual Electron smoke, Fast Refresh
and Node restart checks pass. The rebuilt extracted macOS arm64 ZIP passes
standalone/HTML/subset/lifecycle checks and real Prince PDF generation/preview.
Both audits are clean. Frozen installation refreshed the sibling snapshot, with
no dependency/lockfile changes. Hosted/Linux validation remains pending. Project
inspection and structured user-visible diagnostics remain later plan items.

## Library-owned category and theme inspection

Refresh consumes loadProject categories/themes and creates only the GUI summary
projection. Its separate category JSON parser and theme filesystem inspection
were removed. Publishing uses the shared library's theme validation before CSS
and document writes. Existing IPC/selection limits, session ownership, no-themes
warning and theme-choice behavior are unchanged.

Types/lint and all 61 routine tests pass, as do actual Electron smoke and the
rebuilt extracted macOS arm64 ZIP with real Prince PDF generation/preview.
The no-themes packaged regression remains passing. Both audits are clean;
no dependency/lockfile changes were needed. The library additionally verifies
snapshot consistency, malformed categories, removed themes and symlink policy.
Hosted/Linux execution remains pending.

## Code-review item 7: structured diagnostics

Validated locally on 21 October 2026. The shared pipelines no longer print link
warnings; analyzeLinks returns stable code/severity/source/target records.
Successful results, onDiagnostics and CompilationError carry diagnostics. The
deprecated primitive retains its grouped stderr wrapper for compatibility.

- Library: 123 routine tests passed, two optional skipped. All 23 packed runtime
  exports and TypeScript declarations passed; unpacked/ASAR Electron consumers
  passed.
- CLI: 70 routine tests passed, two optional skipped, including injected-stream
  diagnostics before later failure and executable/subset behavior. Packed
  local/global installation and fixture compilation passed.
- GUI: 65 routine tests passed, one optional skipped. Oversized/invalid diagnostic
  payloads, omitted counts, renderer replacement/failure display and actual
  worker-to-preload success/failure transport passed. The extracted desktop ZIP
  passed standalone compilation, real Prince PDF and isolated preview checks.
- Types, lint and formatting passed in all packages. Full and production audits
  reported no known vulnerabilities in all three.
- Read-only Legends Walk inspection and actual Electron open/refresh showed 461
  entries and 47 diagnostics. Every displayed source/target matched the library
  records and legacy terminal report. No publishing into that checkout occurred.

No hosted CI, signing or publishing was performed.

## Feature parity item 1: GUI output destinations

Validated locally on 21 October 2026 with Node 26.5.0 and actual Electron
45.0.0 / bundled Node 24.22.0 on macOS arm64.

- 75 routine tests pass; one optional timeout test skipped. Types, lint and
  formatting pass. Full and production audits report no known vulnerabilities.
- Regression coverage checks defaults, relative basename, independent overrides,
  spaces/Unicode, native-only external authorization, invalid/oversized requests,
  duplicate/CSS destinations, symlink escapes including dangling links, refresh,
  project reset, chooser cancellation and closed/overlapping sessions.
- The renderer settings test covers saved edits, native selection and keeping
  paths out of publish requests. Custom destination compiler output matches the
  shared pipeline byte-for-byte for identical options.
- Actual Electron smoke checks cover default and custom worker output, native
  save cancellation/confirmation configuration, unauthorized paths, refresh and
  revealing the configured external PDF.
- The extracted desktop ZIP passes the Settings UI workflow with custom basename,
  independent HTML/embedded-HTML paths and native-selected external PDF. Real
  Prince produces the expected four-page text output there; isolated preview
  and reveal use that custom path. Renderer and viewer remain sandboxed.
- Library/CLI runtime code and dependencies are unchanged. Hosted CI, signing and
  publishing were not run. No private project was modified.

## Feature parity item 3: artifact results and stage progress

Validated locally on 21 October 2026 with Node 26.5.0, pnpm 12.14.0 and actual
Electron 45.0.0 / bundled Node 24.22.0 on macOS arm64.

- 83 routine tests passed; one optional timeout test skipped. Types, lint and
  formatting passed; full/production audits reported no known vulnerabilities.
- Artifact decoders cap reports at four unique known kinds and validate status,
  field shape and path length. Main checks paths against the active authorized
  output configuration. Tests reject arbitrary paths and incomplete success
  reports, and preserve phase facts for partial PDF and untouched old output.
- Stage tests cover strict ordering/count bounds, unknown/repeated events,
  mismatched IDs, post-response events, cancellation and worker lifecycle.
  Actual Electron delivered all 24 stage events through the scoped preload
  callback and returned success/failure artifact reports.
- UI tests cover live stages, late callbacks, disabled reveal for unverified or
  unattempted output, completed artifact display after preview failure and
  kind-only reveal. Main tests recheck document existence and reject CSS,
  unknown kinds, uncompleted files and arbitrary paths.
- The extracted desktop ZIP passed the four-row artifact table, revealing HTML
  by kind, custom destination publishing, real Prince PDF text/pages and
  isolated preview. Renderer/viewer sandbox and the narrow bridge remain intact.
- Artifact phase facts do not identify creation/replacement or guarantee atomic
  output. No library/CLI runtime change, hosted CI, signing or publishing was
  performed for this item.

## Feature parity item 4: native Help/About

Validated locally on 21 October 2026 using Node 26.5.0, pnpm 12.14.0 and actual
Electron 45.0.0 / bundled Node 24.22.0 on macOS arm64.

- 83 routine tests passed; one optional timeout test skipped. Types, lint,
  formatting and full/production audits passed with no known vulnerabilities.
- Actual Electron verifies the native Help menu, invokes each topic and About
  before project loading, checks project/theme/recovery guidance and compares
  the displayed version with package.json. Help starts no compiler worker.
- The extracted desktop ZIP invokes Help/About before selecting a project with
  unavailable Prince. About matches the source package version and packaged
  app.getVersion(). Existing custom-path artifact/reveal, real Prince PDF text/
  page and isolated preview checks continue to pass.
- Dialogs are main-owned; no renderer bridge methods, external links or
  dependencies were added. Standard edit/view/window menu roles are retained.
  No library/CLI runtime change, hosted CI, signing or publishing was performed.

## Workspace CLI/GUI acceptance

Validated locally on macOS arm64 on 21 October 2026 using Node 26.5.0,
Electron 45.0.0 / Node 24.22.0, Prince 17 and Poppler.

- The new optional test:parity command passes with both fake Prince and --pdf.
  It builds the sibling CLI and exercises the actual Electron main/preload/
  utility path with a disposable profile and common synthetic project.
- Full project inventories and all/subset diagnostic sets match the shared
  loader and CLI inspection/check output. Full, Alice-only and Alice/Bob
  publishing produce byte-identical HTML/embedded HTML at identical destinations.
  Real PDF text and positive page counts match; GUI preview succeeds.
- Default basenames remain CLI out/<project-name> and GUI out/auto. Non-A5-only
  projects preserve strict CLI A5 behavior and GUI's discovered-theme fallback.
- Missing/malformed categories, no themes, unknown/stale selections, unavailable
  Prince and partial PDF all produce the expected failures. Existing selected
  output survives selection failures; embedded output remains unchanged after
  partial PDF failure. CLI stdout/exit behavior and GUI artifact facts are checked
  separately, including the GUI's earlier Prince preflight.
- Types, lint, formatting and diff checks pass. This change adds acceptance
  automation/documentation only; application/library behavior and dependencies
  are unchanged. No real CLI viewer or private project was opened.
- Runtime source baselines: cross-doc c680b39a8696abc99bc43ae2a761cbc448c046f1,
  CLI 02ae5aac10d0c41f9faaedf348e8693751fac707, GUI
  d661e72de8cf153fa96778589c45ac6884f8d816, plus the new working-tree acceptance
  script and package command. These are local results, not hosted/Linux results.

## Light, dark and system appearance

Validated locally on 21 October 2026 using Node 26.5.0, pnpm 12.14.0 and actual
Electron 45.0.0 / bundled Node 24.22.0 on macOS arm64.

- 88 routine tests pass; one optional timeout test skipped. Types, lint,
  formatting and diff checks pass. Full/production audits report no findings.
- Preference tests cover System default, missing/malformed data recovery,
  persistence, serial saves, invalid values and retaining the applied mode after
  failed writes. Renderer tests cover saved modes, live system changes, explicit
  overrides, single theme style ownership and visible save failures.
- Actual Electron smoke passes with the two added validated appearance methods.
  The extracted desktop ZIP verifies Light/Dark body, toolbar and dialog colors,
  local Inter font loading, explicit nativeTheme overrides and System response
  to emulated OS media changes. Dark selection survives renderer reload and a
  complete app process restart using the same profile.
- Packaged custom-path publishing, artifact/reveal, real Prince PDF text/pages
  and isolated preview checks continue to pass. Appearance does not alter the
  document compilation pipeline or project theme selection.
- No new dependencies, version bump, hosted/Linux native validation, signing or
  publishing were performed. Both PrimeReact palettes are bundled locally.
