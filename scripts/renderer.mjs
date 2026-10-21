import { builtinModules } from 'node:module';
import { fileURLToPath } from 'node:url';
const resolve = (path) => fileURLToPath(new URL(path, new URL('../', import.meta.url)));
export const rendererOptions = {
	configFile: false,
	root: resolve('src/renderer'),
	base: './',
	plugins: [
		{
			name: 'renderer-boundary',
			enforce: 'pre',
			resolveId(id) {
				if (
					id.startsWith('node:') ||
					builtinModules.includes(id) ||
					/^(electron|cross-doc)(\/|$)/.test(id)
				) {
					throw new Error(`Node-only dependency cannot be imported by the renderer: ${id}`);
				}
				return null;
			},
		},
	],
	build: {
		outDir: resolve('dist/renderer'),
		emptyOutDir: true,
		target: 'chrome150',
		rolldownOptions: {
			onwarn(warning, defaultHandler) {
				if (warning.code === 'MODULE_LEVEL_DIRECTIVE' && warning.message.includes('use client'))
					return;
				defaultHandler(warning);
			},
		},
	},
};
