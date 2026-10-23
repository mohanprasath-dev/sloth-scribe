const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

function findBash() {
	if (process.platform === 'win32') {
		const candidates = [
			'C:\\Program Files\\Git\\bin\\bash.exe',
			'C:\\Program Files\\Git\\usr\\bin\\bash.exe',
			'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
			'C:\\Program Files (x86)\\Git\\usr\\bin\\bash.exe',
		];
		for (const candidate of candidates) {
			if (fs.existsSync(candidate)) {
				return candidate;
			}
		}
	}
	return 'bash';
}

function runFixture() {
	const bashPath = findBash();
	const scriptPath = path.resolve(__dirname, 'make-fixture.sh');
	const rootDir = path.resolve(__dirname, '..');

	const result = spawnSync(bashPath, [scriptPath], {
		stdio: 'inherit',
		cwd: rootDir,
	});

	if (result.error) {
		console.error('Failed to run make-fixture.sh:', result.error);
		process.exit(1);
	}

	process.exit(result.status ?? 0);
}

runFixture();
