# GUI development tooling

Use Node 24.22.0 and pnpm 12.14.0. Node 26 is an additional validation line.
Build the adjacent cross-doc checkout before installing this app, and reinstall
following library rebuilds to refresh pnpm's local file dependency snapshot.

```sh
pnpm install --frozen-lockfile
pnpm run check:package-manager
pnpm run typecheck
pnpm run lint
pnpm run format:check
pnpm test
pnpm run test:coverage
pnpm run build
pnpm run test:electron
pnpm start
```

`start` builds then launches the compiled application. Its launcher removes
ELECTRON_RUN_AS_NODE when inherited from editor terminals. The development
runtime is Electron 45.0.0, whose bundled Node 24.22.0 satisfies cross-doc's
minimum. The standalone development Node and Electron runtime are separate.
The Electron smoke check launches a real window and closes it automatically.
On Linux it requires a display (for example Xvfb); it never disables the sandbox.
Desktop distributables use Forge; see [packaging](packaging.md).

## Development server

`pnpm dev` starts Vite and launches the compiled Electron entry with a loopback
renderer URL. React Fast Refresh updates compatible component edits while
preserving UI state; CSS updates in place. Main/preload/utility/shared edits
stop Electron, type-check/rebuild Node code and the bundled preload, then start
a fresh process. Failed rebuilds remain stopped until another edit succeeds.
A full restart resets project state. Ctrl+C stops Electron and the server.
The fixed port 5173 fails clearly if occupied; it does not attach to another
server. `pnpm run typecheck` checks renderer types separately from Vite's fast
transformation. Avoid concurrent dev/package/build commands against dist.

Development uses @vitejs/plugin-react 6.1.2 and the same renderer import boundary
as production. Only development-served HTML permits inline Fast Refresh setup
and local HMR WebSockets. Source/production HTML keeps its original CSP.
Renderer Node integration stays disabled with sandbox/context isolation enabled;
IPC authorization uses the exact development document and frame. Packaged apps
ignore the development URL environment variable; unpackaged apps accept only
an HTTP URL on 127.0.0.1 with a port and root path.

`pnpm run test:dev` launches real Electron, edits/restores the React source and
verifies Fast Refresh preserves project/theme state, then edits/restores main
code and verifies process restart. It uses temporary user data. CI runs this
under Xvfb on Linux and directly on macOS. Production build/start, packaging and
real Electron smoke commands continue to use local built assets.
See [Vite React Fast Refresh](https://github.com/vitejs/vite-plugin-react/tree/main/packages/plugin-react).

## Build boundaries

- `tsconfig.node.json` emits native ESM main-process code and source maps.
  DOM declarations are included because Electron's shared declarations refer
  to browser MessagePort, VideoFrame and HTMLElement types. No library checking
  is skipped. Paths use import.meta.url, not the launch working directory.
- `tsconfig.renderer.json` independently checks browser TSX using the modern
  automatic JSX transform. `tsconfig.json` supplies that same JSX configuration
  to editors and Vite; browser code imports only serializable shared types.
- Vite 8 builds the HTML entry and local theme, icon, font and script assets
  with a relative base for file loading. A build guard rejects Node built-ins,
  Electron and cross-doc in the renderer dependency graph. The browser-only
  build ignores the irrelevant `use client` server-component directive warning.
- esbuild bundles the preload to one `dist/preload/index.cjs`, leaving only
  Electron external. This deliberate CommonJS boundary is required by Electron's
  sandboxed preload loader; it is not a CommonJS application distribution.
- Each build cleans dist, type-checks both process configurations, and generates
  fresh assets. Startup does not wait for app readiness at module top level:
  Electron must finish loading the ESM entry before it can signal readiness.
- Oxlint enforces correctness, import and TypeScript rules; Oxfmt follows the
  sibling tab/single-quote/semicolon/LF conventions. Generated assets, patches,
  lockfiles, fixtures and the historical audit JSON are excluded appropriately.

See [Electron ESM](https://www.electronjs.org/docs/latest/tutorial/esm),
[React's upgrade guide](https://react.dev/blog/2024/04/25/react-19-upgrade-guide)
and [Vite's production build guide](https://vite.dev/guide/build).

## PrimeReact selection and declaration patch

React/ReactDOM 19.3.1 use matching 19.3.0 types. PrimeReact 10.9.9 is the
registry's maintained `v10-stable` line and declares React 19 peers. The latest
11.2.1 release was evaluated but its generated declarations refer to undefined
I_1/P/T_1 generic names. It cannot pass this project's dependency type checking.
Its component/theming rewrite is documented in the
[PrimeReact migration guide](https://primereact.dev/docs/styled/guides/migration/updating-to-v11).
Re-evaluate the stable v11 line once its declarations are repaired.

The v10 declarations also need a reproducible, declaration-only React 19 patch:

- Qualify remaining global JSX type references as React.JSX.
- Omit the native HTML onToggle prop from five interfaces which supply their
  own, differently shaped onToggle events (fieldset, inplace, panel, treeselect
  and treetable).

`patches/primereact@10.9.9.patch` is applied and integrity-checked by pnpm through
patchedDependencies. It changes no JavaScript, runtime event behavior or public
application types, adds no any types, and does not enable skipLibCheck.
Keep the patch with the lockfile; remove it only after an upstream release
passes both strict checks and the UI tests without it. No global JSX shim or
broad suppression is used. Use the shipped lara-light-blue theme and core CSS,
with PrimeIcons 8 font assets bundled locally.

## Current process integration

The TypeScript migration initially supplied a minimal three-operation bridge
(chooseProject, refresh, publish), native directory selection, explicit renderer
isolation/sandbox flags and a typed compiler adapter. This brings
forward only the wiring needed to run the converted app without renderer Node
imports or the removed remote API. No general-purpose IPC API is exposed.

Step 3 moved compilation to a utility process and step 4 added native Prince
configuration plus isolated PDF preview/reveal, described in
[publishing](publishing.md). The bridge exposes twelve specific operations:
chooseProject, refresh, publish, getPrince, choosePrince, revealPdf, getOutputs,
setOutputs, chooseOutput, revealArtifact, getAppearance and setAppearance.
getPrince is a no-argument read-only availability check using the same resolver
as publishing; failures drive the Settings attention indicator. Prince and reveal operations
accept no renderer-supplied paths or commands. Output configuration accepts
bounded project-relative paths or a retained native-authorized absolute path;
chooseOutput accepts only a known document kind. Main owns authorization and
resolution, and the internal worker job requires explicit absolute output paths. The obsolete electron-pdf-window
wrapper remains removed.

CSP permits local scripts and denies inline scripts/eval, external connections,
objects and forms. Inline styles are allowed specifically for PrimeReact's
runtime style insertion and inline layout; do not extend that exception to
scripts. Projects remain trusted compiler inputs.

## Isolated compiler and request lifecycle (step 3)

The main process no longer imports cross-doc. It keeps a ProjectSession for each
application window and launches `dist/utility/index.js` for document loading or
publishing. Prince configuration and preview/reveal remain in main. The utility imports the public library root; it returns only entry
and category summaries, or the generated PDF path. No HTML, parsed documents,
Cheerio objects, filesystem or process API is exposed to the renderer.

Each operation launches a fresh worker, waits for its ready handshake, sends a
UUID-correlated job and validates the response before accepting it. There is no
background queue: overlapping operations are rejected. A slot remains occupied
until worker exit, including across document reload/window replacement. Normal
completion retires the worker; exceptions, fatal errors, startup exits and a
120-second operation deadline reject the request. Failed termination is bounded
by a further two seconds and blocks new workers until application restart rather
than risking overlapping output. Retry after ordinary failure creates a fresh
process. Logs remain in the terminal; the UI uses its existing operation status
and structured error response. Publish also forwards a fixed, validated stage
sequence through an invocation-scoped callback; preload removes its listener
on completion/failure. Closed sessions and mismatched operation IDs discard
late events.

Main canonicalizes the native chooser's absolute directory and owns the known theme list and the
three output paths. Publish accepts only an optional include array of unique,
known entry slugs and an optional known theme name; category keys, empty arrays, extra options, filenames, arbitrary themes
and executable overrides are rejected. A failed refresh marks the main session
stale until a successful retry. Cancellation or a failed Open leaves the previous
valid project selected. Every IPC call checks webContents, main-frame identity
and the exact app document URL; a file:// origin alone is insufficient.

Preload validates requests before IPC and decodes responses. Main repeats
validation and checks current session state. Text fields are capped at 4096
UTF-16 units and arrays at 50,000 elements; conservative aggregate UTF-8 budgets
are 1 MiB for selections and 16 MiB for project summaries, including per-field
framing allowances. Oversized projects fail with an actionable error; this is a
bridge bound, not a compiler-memory sandbox. Worker replies are validated before
sending and after receiving. TypeScript does not replace these runtime checks.

Document reload, renderer crash, window close and app quit close old sessions
and terminate their active workers. Session checks and renderer mount-generation
tokens discard late results. Open/project changes are serialized with document
work, so an earlier project's pending job cannot mutate a later selection.
Navigation, new windows, webviews and permission requests/checks are denied.
The CSP's inline-style exception remains limited to PrimeReact layout/styles;
inline scripts/eval and external connections are forbidden.

See [Electron utility processes](https://www.electronjs.org/docs/latest/api/utility-process),
[parentPort](https://www.electronjs.org/docs/latest/api/parent-port) and the
[security checklist](https://www.electronjs.org/docs/latest/tutorial/security).
The utility is a Node-capable process for trusted projects, not an OS sandbox
for Sass or Prince. Interruptions can leave partial files; terminating a utility
is not a transactional rollback or a guarantee of cancelling an already spawned
external Prince process. The library retains its separate 30-second executable
timeout. Real-PDF checks and preview/configuration are implemented in step 4; see [publishing](publishing.md).

## Desktop distribution

`package` builds an unpacked Forge application; `make` also creates an unsigned
host ZIP. `test:package -- --zip` launches the extracted distributable outside
the repository; add `--pdf` for real Prince/Poppler checks. The production
dependency deployment, ASAR/resource layout and CI matrix are documented in
[packaging](packaging.md).

## Ongoing maintenance

Dependency build permissions are explicit in `pnpm-workspace.yaml`. Weekly
compatibility checks, independent full/production audits, Dependabot review and
version alignment are described in [maintenance](maintenance.md).

## Shared library preparation and compilation

The utility uses cross-doc's loadProject for write-free refresh and compileProject
for publishing. Application output paths/theme defaults, Prince configuration,
IPC/session ownership and serializable summaries remain in the GUI. Category/theme inspection comes from the library loader. The GUI projects
categories to its own summaries and retains independent IPC validation. GUI subset/full output parity is tested against the same shared
compiler; progress and artifact/error contracts are documented in the library.

Artifact reports are limited to the four known kinds and phase statuses; main
matches paths against authorized output configuration before retaining facts.
revealArtifact accepts only html/pdf/embedded-html and uses a completed artifact
from that retained report. publish accepts an optional progress callback at the
bridge; preload creates its correlation ID internally. It does not expose a
general subscribe or send API. See publishing for payload and lifetime limits.

## Native Help/About

Main installs the native application menu after app readiness. Help topics and
About are main-owned native message boxes; the version comes from the package
metadata located relative to the compiled main entry, including ASAR installs.
The standard edit/view/window menu roles remain available. Help has no project,
Prince or compiler dependency and introduces no metadata IPC or external-link
opening capability. Actual Electron and extracted-package tests invoke the menu
callbacks, inspect dialog options and compare the displayed version to metadata.

## Appearance preference

getAppearance/setAppearance are authorized narrow IPC operations accepting and
returning only light/dark/system. Main serializes atomic preference-file
replacements and updates nativeTheme.themeSource after saving. It loads the
preference before opening the initial window. The renderer tracks effective
system appearance with matchMedia/useSyncExternalStore and swaps a single
owned style element containing bundled PrimeReact light/dark CSS. Theme fonts
are local Vite assets; CSP/network permissions are unchanged. Renderer callbacks
are invalidated on unmount, and the media subscription/style element is cleaned
up. There is no renderer filesystem access or appearance setting in project
compilation options.
