// Exact document URL plus both webContents and frame identity: a file:// origin
// alone also matches unrelated local documents and is not authorization.
export function authorizeSender(
	actual: { contents: unknown; frame: unknown; url: string },
	expected: { contents: unknown; frame: unknown; url: string },
): void {
	if (
		actual.contents !== expected.contents ||
		actual.frame !== expected.frame ||
		actual.url !== expected.url
	) {
		throw new Error('Unknown application window or frame');
	}
}

export function noArguments(args: readonly unknown[]): void {
	if (args.length) throw new Error('This operation accepts no arguments');
}
