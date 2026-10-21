import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { makeRuntimePortable } from './scripts/runtime-links.mjs';
import MakerZIP from '@electron-forge/maker-zip';

const config = {
	packagerConfig: {
		name: 'Cross-Doc',
		executableName: 'cross-doc-gui',
		appBundleId: 'uk.me.dorward.cross-doc-gui',
		appCategoryType: 'public.app-category.productivity',
		asar: true,
		extraResource: [],
		afterCopyExtraResources: [
			async ({ buildPath, platform }) => {
				const source = config.packagerConfig.extraResource[0];
				if (!source)
					throw new Error('Use pnpm run package or make to deploy runtime dependencies first.');
				const destination = join(
					buildPath,
					platform === 'darwin'
						? 'Cross-Doc.app/Contents/Resources/node_modules'
						: 'resources/node_modules',
				);
				await makeRuntimePortable(source, destination);
			},
		],
		// pnpm deploy has already created an isolated production-only graph.
		prune: false,
		overwrite: true,
		ignore: [/^\/forge\.config\./, /^\/pnpm-/, /^\/node_modules(?:\/|$)/],
	},
	// Sass compilation does not use its optional watch-mode native addon.
	// Preserve the installed N-API prebuild; do not compile an unused watcher.
	rebuildConfig: { ignoreModules: ['@parcel/watcher'] },
	makers: [new MakerZIP({}, ['darwin', 'linux'])],
	hooks: {
		packageAfterCopy: async (_config, buildPath) => {
			const filename = join(buildPath, 'package.json');
			const source = JSON.parse(await readFile(filename, 'utf8'));

			// Ship an application manifest, not development commands/local checkout paths.
			const manifest = Object.fromEntries(
				['name', 'productName', 'version', 'description', 'author', 'license', 'type', 'main']
					.filter((key) => source[key] !== undefined)
					.map((key) => [key, source[key]]),
			);
			manifest.dependencies = source.dependencies;
			await writeFile(filename, JSON.stringify(manifest, null, 2) + '\n');
		},
	},
};

export default config;
