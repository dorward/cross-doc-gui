import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import electron from 'electron';

const env = { ...process.env };
// Editor terminals may set this for their own Electron host.
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(electron, [fileURLToPath(new URL('../', import.meta.url))], {
	env,
	stdio: 'inherit',
});
child.on('error', (error) => {
	console.error(error.message);
	process.exitCode = 1;
});
child.on('exit', (code, signal) => {
	if (signal) console.error(`Electron exited on ${signal}`);
	process.exitCode = code ?? 1;
});
