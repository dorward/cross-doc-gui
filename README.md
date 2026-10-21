# Cross-Doc-gui

A graphical user interface for [cross-doc](https://github.com/dorward/cross-doc)

## Development setup

Use Node 24.22.0 (pinned in `.node-version`) and pnpm 12.14.0. The library
checkout must be adjacent to this repository. Build it before installing:

```sh
cd ../cross-doc
pnpm install --frozen-lockfile
pnpm run build
cd ../cross-doc-gui
pnpm install --frozen-lockfile
pnpm run check:package-manager
```

Install the pinned pnpm version using your Node/toolchain manager before
running these commands. `file:../cross-doc` is intentional: rebuild the sibling
and reinstall the GUI after library changes to refresh pnpm's package snapshot.
Only `pnpm-lock.yaml` is supported. Modern npm rejects this repository's
install/ci/run commands through devEngines; older npm or deliberate bypasses
may not enforce that policy. It is a contributor policy, not an end-user rule.
Dependency installation scripts require explicit review in pnpm-workspace.yaml.

## Development with hot reloading

Run `pnpm dev` to launch Electron with Vite on `http://127.0.0.1:5173`.
React component edits use Fast Refresh, normally retaining the open project and
selection; CSS changes apply immediately. Changes to main, preload, utility or
shared code rebuild and restart Electron together, clearing the open project.
Stop with Ctrl+C. `pnpm start` still performs a production build and launch.
Run `pnpm run typecheck` separately for full renderer type diagnostics.

## Upgrade status and usage

The six implementation stages in the [upgrade plan](UPGRADE_PLAN.md) are in
place. Hosted CI, Linux validation and Dependabot operation remain pending.
Run `pnpm start` to build and launch the Electron GUI, then Open a trusted
project. All entries start selected; category checkboxes select descendant
entries, and clearing the selection disables Publish. Refresh reloads the
project and reconciles surviving selections. Publish defaults to `out/auto.html`,
`out/auto.pdf` and `out/auto-complete.html` using the theme selected in the dropdown before Publish. A5 is preferred
initially when available. In Settings, Output destinations lets you change the
basename or individual document paths; use Choose file for external destinations.
These settings last for the current project session. Projects without themes show a warning icon and
cannot publish.

Install Prince separately, then open the toolbar’s cog **Settings** and use **Choose Prince** if it is not found
automatically on PATH. A red dot on the cog means the Prince setting needs
attention. The dialog displays the resolved path or a useful error. The chosen executable is saved for future launches. Successful
publishing opens PDF preview; **Reveal PDF** locates the saved file if preview
fails. Publishing shows live stages and an Output files table with phase
completion facts; completed document rows can be revealed individually.
Errors appear in the GUI; refresh failures require a successful retry
before publishing. See [publishing and verification](docs/publishing.md).

The native **Help** menu provides project setup, warning explanations, output
destinations and publishing recovery guidance without a project or Prince.
**Help → About Cross-Doc** shows the packaged version; on macOS it is also in
the application menu.

Choose **Settings → Appearance → Color mode** for **Light**, **Dark** or
**System** (the default). The choice is saved across launches. System follows
OS appearance changes automatically; this controls the app, independently of
the project's publishing theme.

A synthetic project is available at `tests/fixtures/project`. Use a temporary
copy when publishing. The [GUI behavior contract](docs/application-contract.md)
and [tooling guide](docs/tooling.md) describe state, paths, scripts and the
reviewed PrimeReact declaration patch. Run `pnpm test`, `pnpm run typecheck`,
`pnpm run lint`, `pnpm run format:check` and `pnpm run test:electron` for checks.

See [validation](docs/validation.md) for exact results and boundaries. Document
work runs in a utility process behind bounded, validated IPC.
Worker failures reject the operation and permit retry; refresh failures require
a successful refresh before publishing. Renderer Node access and remote have
been removed.
Projects remain trusted inputs: renderer sandboxing does not isolate Sass or
Prince from local files. Build an unsigned desktop ZIP with `pnpm run make`
and verify it with `pnpm run test:package -- --zip`. See the
[packaging guide](docs/packaging.md) for layout, artifacts and platform limits.

## Platforms and maintenance

Development uses Node 24.22.0, with Node 26 additionally tested. Electron 45.0.0
bundles its own Node runtime; packaged users need neither Node nor pnpm.
The unsigned macOS arm64 ZIP has been tested locally. Linux/macOS hosted checks
are configured but await execution; Windows packaging is not supported.
See [maintenance](docs/maintenance.md) for weekly updates/audits, the
latest-sibling compatibility policy and distribution checks.

## Contributing

Pull requests are welcome. For major changes, you may wish to open an issue
first to discuss what you would like to change as rejection after doing the
work may hurt.

## Contributors

- [David Dorward](https://github.com/dorward/)

## License

[ISC](LICENSE.md)

## Workspace parity acceptance

With the sibling CLI and library checkouts installed, run pnpm run test:parity
from this directory to compare the CLI with the actual Electron bridge/worker
using a temporary synthetic project. Add -- --pdf to compare real Prince PDF
text/pages and preview (Prince and Poppler required). The default uses a fake
renderer and needs no Prince installation. This optional workspace check builds
both applications; run it separately from CLI tests/package commands because
it rebuilds CLI dist. See tests/README.md for scope and prerequisites.
