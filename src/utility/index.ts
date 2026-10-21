import { decodeArtifacts, stageSequence } from '../shared/compilation.js';
import { CompilationError } from 'cross-doc';
import { projectDiagnostics } from '../shared/diagnostics.js';
import { refreshProject, publishProject } from './compiler.js';
import { decodeJob } from './protocol.js';
import { decodeSnapshot, decodeFiles, errorMessage } from '../shared/validation.js';

const port = process.parentPort;
if (!port) throw new Error('Compiler must run in an Electron utility process');
let received = false;
port.on('message', async ({ data }: { data: unknown }) => {
	// A fresh worker handles exactly one operation. No background queue or overlapping writes.
	if (received) return;
	received = true;
	let id: string | null = null;
	try {
		const job = decodeJob(data);
		id = job.id;
		const sequence = stageSequence();
		const value =
			job.kind === 'refresh'
				? decodeSnapshot(await refreshProject(job.project))
				: decodeFiles(
						await publishProject(job.project, job.request, job.princeBinary, job.outputs, (event) =>
							port.postMessage({ id, progress: sequence(event) }),
						),
					);
		port.postMessage({ id, result: { ok: true, value } });
	} catch (error) {
		port.postMessage({
			id,
			result: {
				ok: false,
				error: errorMessage(error),
				...(error instanceof CompilationError
					? {
							diagnostics: projectDiagnostics(error.diagnostics),
							artifacts: decodeArtifacts(error.artifacts),
						}
					: {}),
			},
		});
	}
});
port.postMessage({ ready: true });
