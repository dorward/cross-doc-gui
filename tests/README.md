# GUI validation

`pnpm test` runs boundary, session, worker-lifecycle, selection and React component checks under StrictMode using
Vitest and React Testing Library. They exercise no-project state, Open cancel,
category/leaf selection, all/subset/empty selection, project reset, refresh
failure/retry and overlapping operations. `pnpm run test:coverage` measures the
renderer adapters and boundary helpers; it is not whole-application coverage.

`pnpm run test:electron` builds and launches the real Electron application from
an unrelated temporary working directory, using a temporary copy of the fixture.
The harness controls only native selection and the test-side utility launcher.
It verifies mount/assets and sandbox settings, validates IPC restrictions,
refreshes via a real utility, kills a worker and retries, checks main heartbeat
during CPU load, rejects concurrent calls and tests reload while work is pending.
It also publishes all/subset HTML and embedded SVG through the real pipeline,
with a fake Prince executable verifying invocation/error propagation. Those fake
PDF bytes exercise preview failure and reveal; real viewing is checked separately. All generated files and user
data are temporary. Linux needs a display, such as Xvfb. No sandbox-disabling
flags or production test channels are used.

The trusted project in `fixtures/project` is derived from cross-doc's fixture.
See [the application contract](../docs/application-contract.md) for intended
behavior and fixture scope. Both default and A5 themes use the same minimal
SCSS. Use temporary copies for output tests. The compiler regression suite checks the committed HTML baseline and input/output
failures. Packaged-app checks are described below. A fake renderer
or Prince executable cannot establish real PDF layout or preview compatibility.

`pnpm run test:timeout` opts into the actual 30-second Prince executable timeout.
`pnpm run test:pdf` uses an installed Prince and Poppler, compiles the fixture in
a real utility process and opens the built-in isolated Electron PDF viewer. It
checks text/four-page count, renders all pages, captures the viewer, then crashes
its renderer and verifies saved-file recovery. CROSS_DOC_PRINCE_BINARY may name
an absolute executable; CROSS_DOC_PDF_ARTIFACT_DIR optionally retains review
outputs and PNGs. See [publishing](../docs/publishing.md) for prerequisites and
validation boundaries. No real-PDF or external executable is needed for the
routine Vitest suite; the timeout check is skipped unless explicitly selected.

`pnpm run make && pnpm run test:package -- --zip` validates the extracted
standalone application, real utility compilation, runtime dependency links,
renderer isolation, native chooser seams, outputs and window lifecycle. Add
`--pdf` for installed Prince/Poppler and real packaged preview. See
[packaging](../docs/packaging.md) for prerequisites and platform boundaries.

`pnpm run test:dev` verifies React Fast Refresh in Electron, preserving project
and selected theme after a component edit, and verifies Node-side edits restart
the app. Source edits are restored in finally; run it without another dev
server or simultaneous source edits. It uses temporary Electron user data.

## Workspace parity acceptance

Run pnpm run test:parity, or pnpm run test:parity -- --pdf with Prince and
Poppler installed. CROSS_DOC_PRINCE_BINARY can select a real Prince executable.
This optional script requires the installed ../cross-doc-cli sibling checkout
and the usual installed/built local library snapshot. It is not a standalone
packaged-app command or a new GUI runtime dependency.

The command builds the GUI and CLI sequentially, launches actual Electron with a
temporary profile, and compares shared project summaries, category/theme data,
diagnostic sets, HTML/embedded HTML and PDF output for all and selected entries.
Real PDF mode compares text and positive page counts, not volatile PDF metadata
or binary identity. It also tests defaults and failure/recovery cases for
categories, selections, themes, unavailable Prince and partial PDF. All publishing
uses disposable synthetic fixtures; no private project or real CLI viewer opens.

Run this separately from CLI executable/package checks, which also rebuild dist.
The usual Electron display/Xvfb requirements apply on Linux. The existing GUI
CI may only check out GUI/library; the additional CLI checkout is intentionally
required for this optional workspace acceptance command.
