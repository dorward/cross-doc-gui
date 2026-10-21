import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		environment: 'jsdom',
		include: ['tests/**/*.test.mjs'],
		setupFiles: ['tests/setup.mjs'],
		coverage: {
			provider: 'v8',
			include: [
				'src/renderer/App.tsx',
				'src/renderer/selection.ts',
				'src/main/worker.ts',
				'src/main/session.ts',
				'src/main/security.ts',
				'src/main/prince.ts',
				'src/utility/compiler.ts',
				'src/shared/validation.ts',
				'src/utility/protocol.ts',
			],
		},
	},
});
