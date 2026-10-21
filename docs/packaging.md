# Desktop packaging

Use the pinned development toolchain and build/install the sibling library as
shown in README before packaging. Prince remains a separately installed and
licensed executable; it is not bundled.

```sh
pnpm run package                 # unpacked application under out/
pnpm run make                    # application plus host-specific ZIP
pnpm run test:package -- --zip    # test the extracted distributable
pnpm run test:package -- --zip --pdf # also use installed Prince and Poppler
```

Both packaging commands clean `out/` before invoking Forge, removing previous
applications and ZIPs. Cleanup retries transient filesystem errors such as
ENOTEMPTY; temporary deployment cleanup uses the same retry policy.

Forge 8.0.1 creates unsigned macOS/Linux host-architecture ZIPs under
`out/make/zip/<platform>/<architecture>/`. The locally validated artifact is
`out/make/zip/darwin/arm64/Cross-Doc-darwin-arm64-0.0.1.zip`.
Signing, notarization, publishing and automatic updates are not configured.
Windows packaging is not supported by this configuration. Linux packaging and
launch are configured in CI but await a hosted run; local evidence is macOS arm64.

## Runtime layout

The packaging script uses `pnpm deploy --legacy --prod --ignore-scripts` to
stage the locked production graph. Legacy deploy accommodates the intentional
`file:../cross-doc` dependency outside the workspace. The staged manifest uses
the installed library version; the source manifest and lockfile remain unchanged.
Forge packages compiled main/utility/preload/renderer assets in `app.asar`.
Production dependencies live in the real `Resources/node_modules` directory
(`resources/node_modules` on Linux), alongside the ASAR. This lets native ESM
utility imports resolve the library's dependencies without ASAR symlink failures.
Development dependencies and source/test/build scripts are excluded.

Packager's extra-resource copy turns dependency symlinks into absolute staging
paths. An after-copy hook rebases those links to relative packaged paths before
making the ZIP, rejecting broken links or targets outside the deployed tree.
The staging directory is removed after packaging. The app needs neither the
checkout, sibling library, pnpm store, system Node nor a development server.
Project files, outputs, settings and the chosen Prince executable stay on the
real filesystem. The optional Sass watch-mode addon is not rebuilt; application
compilation does not use watch mode.

## Verification and CI

The packaged test copies or extracts the app to a path containing spaces and
Unicode, launches it from an unrelated cwd with development environment removed,
and checks every symlink. It inspects ASAR contents and the shipped manifest,
then exercises native project/Prince selection through test-side dialog seams,
renderer isolation, refresh, missing/nonzero Prince, all/subset publishing,
reviewed HTML and embedded SVG, reveal and platform window lifecycle. The PDF
option also checks real Prince output, four-page text and an isolated viewer.
No production test channel or Chromium sandbox-disabling flag is introduced.

The validation workflow builds the latest sibling master, records its SHA and
runs frozen installation, routine checks, actual Electron, extracted ZIP and
both audits on macOS/Linux with Node 24.22.0 and 26.12.0. Linux uses Xvfb and
allows Chromium's namespace sandbox. CI keeps unsigned ZIPs for seven days.
An optional manually dispatched job uses a self-hosted runner labelled `prince`
and `desktop` for real PDF/timeout checks; it needs Prince, Poppler and a usable
desktop display. Hosted runs and Linux behavior are not established by local
macOS results. See [validation](validation.md) for recorded evidence.
