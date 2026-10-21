# Maintenance and distribution checks

Use Node 24.22.0 and pnpm 12.14.0 from the checked-in pins. Node 26 is an
additional development validation line. Electron 45.0.0 supplies its own Node
24.22.0 runtime; end users do not install Node or pnpm. Local desktop evidence
is macOS arm64. Linux/macOS CI is configured, with hosted results still pending;
Windows is not a supported packaging target. See [validation](validation.md).

## Dependency updates

Dependabot checks registry dependencies and GitHub Actions weekly on Monday at
07:00 Europe/London. Minor/patch updates are grouped by production/development;
major changes remain separate reviews. The sibling cross-doc dependency is
excluded and must remain `file:../cross-doc`. No automatic merge is configured.
GitHub has announced [pnpm 12 support](https://github.blog/changelog/2026-10-20-dependabot-now-supports-npm-12-pnpm-11-and-12-and-bun-1-4/),
but successful PR generation with this local dependency/patch layout still
needs confirmation after the configuration reaches GitHub. The configuration
uses GitHub's [Dependabot options](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference).

Review each proposed manifest/lockfile diff. Regenerate with pinned pnpm when
necessary; do not accept alternate lockfiles, a registry replacement for the
sibling, broad hoisting or forced audit fixes. Review installation scripts in
`pnpm-workspace.yaml`: Electron's download and esbuild's binary check are allowed;
the unused optional Sass watcher build is denied. Review release-age exceptions
before adding or carrying them forward.

Keep React/ReactDOM and their types compatible, Vitest/V8 coverage versions
matched, and Forge packages aligned. PrimeReact updates must pass strict type
checking without skipLibCheck; remove its declaration patch only after upstream
fixes pass types and UI checks. Electron updates require real isolated renderer,
utility, packaged launch and PDF viewer checks. The bundled Node must satisfy
the library baseline. Update Node pins, engines, CI and docs together; pnpm
updates also require packageManager/devEngines and lockfile review.

For library changes, build the sibling and reinstall the GUI to refresh pnpm's
local snapshot before checks and packaging. Never copy installed dependency
files manually or hide compatibility failures by falling back to an older SHA.

## Scheduled monitoring

The validation workflow runs Monday at 07:37 UTC, plus pushes, pull requests
and manual dispatch. It tests latest cross-doc master on macOS/Linux and
Node 24/26, logging the resolved library SHA. Reproduce compatibility failures
against that SHA and fix the application or upstream; retain frozen installs.
The existing sole-lockfile/package-manager check rejects npm/yarn lockfiles
and a mismatched pnpm invocation.

An independent scheduled/manual audit job checks the committed lockfile without
installing dependencies or fetching the sibling. Both full and production audits
run even when one fails; either failure fails the job. This remains useful when
upstream installation or desktop checks break. Inspect reported dependency paths,
update supported parents and document remaining findings and remediation.

GitHub schedules run from the default branch and can be delayed. Commit/merge
these files before verifying hosted runs and Dependabot PR generation. Adding
configuration does not dispatch workflows or change repository settings.

## Before sharing a desktop artifact

1. Record the sibling library SHA, rebuild it, and reinstall the GUI snapshot.
2. Run frozen installation, `check:package-manager`, `typecheck`, `lint`,
   `format:check`, `test:coverage`, `test:electron` and both pnpm audits.
3. Run `pnpm run make`, then `pnpm run test:package -- --zip` on each claimed
   OS/architecture. Native optional dependencies and Electron make a host ZIP
   specific to that target; do not claim universal platform support.
4. With Prince and Poppler installed, run `test:pdf`, `test:timeout` and
   `test:package -- --zip --pdf`. Review rendered fixture pages and viewer;
   fake Prince output cannot establish layout or PDF compatibility.
5. Share the tested unsigned ZIP from `out/make/zip/` with recorded versions
   and validation limits. Review [packaging](packaging.md) for its ASAR/runtime
   layout and [publishing](publishing.md) for external Prince configuration.

The local macOS review ZIP was built and tested in stage 5. Signing,
notarization, release publishing and auto-update infrastructure need separate
credentials/distribution decisions. None is configured or performed here.
