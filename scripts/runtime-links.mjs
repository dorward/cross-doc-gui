import { readdir, readlink, realpath, symlink, unlink } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative } from 'node:path';

// Packager's extraResource copier expands relative links into absolute links.
// Rebase only links whose real target belongs to the isolated deploy tree.
export async function makeRuntimePortable(source, destination) {
	const root = await realpath(source);
	async function visit(directory) {
		for (const entry of await readdir(directory, { withFileTypes: true })) {
			const path = join(directory, entry.name);
			if (entry.isSymbolicLink()) {
				const link = await readlink(path);
				if (!isAbsolute(link)) continue;
				const target = relative(root, await realpath(path));
				if (isAbsolute(target) || target === '..' || target.startsWith('../'))
					throw new Error(`Dependency link escapes deployment: ${path}`);
				await unlink(path);
				await symlink(relative(dirname(path), join(destination, target)), path);
			} else if (entry.isDirectory()) await visit(path);
		}
	}
	await visit(destination);
	const deployedRoot = await realpath(destination);
	async function verify(directory) {
		for (const entry of await readdir(directory, { withFileTypes: true })) {
			const path = join(directory, entry.name);
			if (entry.isSymbolicLink()) {
				const target = relative(deployedRoot, await realpath(path));
				if (isAbsolute(target) || target === '..' || target.startsWith('../'))
					throw new Error(`Dependency link is not portable: ${path}`);
			} else if (entry.isDirectory()) await verify(path);
		}
	}
	await verify(destination);
}
