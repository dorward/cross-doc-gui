// Test-only CPU load before the real compiler worker starts. Main must stay responsive.
const until = Date.now() + 350;
while (Date.now() < until) {
	/* intentional CPU-bound fixture */
}
await import('../../dist/utility/index.js');
