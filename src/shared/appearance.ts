export type ColorMode = 'light' | 'dark' | 'system';
export function decodeColorMode(value: unknown): ColorMode {
	if (value !== 'light' && value !== 'dark' && value !== 'system')
		throw new Error('Invalid color mode');
	return value;
}
