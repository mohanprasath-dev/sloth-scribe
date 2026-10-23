import * as fs from 'node:fs';
import * as path from 'node:path';

function findFiles(entry: string): string[] {
	if (!fs.existsSync(entry)) {
		return [];
	}

	const stat = fs.statSync(entry);
	if (stat.isFile()) {
		return [entry];
	}

	if (!stat.isDirectory()) {
		return [];
	}

	const results: string[] = [];
	const items = fs.readdirSync(entry);

	for (const item of items) {
		if (item === 'node_modules' || item === '.git' || item === '.next') {
			continue;
		}
		const fullPath = path.join(entry, item);
		const itemStat = fs.statSync(fullPath);
		if (itemStat.isDirectory()) {
			results.push(...findFiles(fullPath));
		} else if (itemStat.isFile()) {
			results.push(fullPath);
		}
	}

	return results;
}

function checkFile(filePath: string): boolean {
	const buffer = fs.readFileSync(filePath);
	let lineNumber = 1;
	let hasError = false;

	for (let i = 0; i < buffer.length; i++) {
		const byte = buffer[i];
		if (byte === 0x0a) {
			lineNumber++;
		} else if (byte > 127) {
			console.error(`${filePath}:${lineNumber}: non-ASCII byte 0x${byte.toString(16)} (${byte})`);
			hasError = true;
		}
	}

	return !hasError;
}

function runAsciiCheck(): void {
	const targets = [
		'src',
		'app',
		'components',
		'scripts',
		'docs',
		'README.md',
		'AGENT.md',
		'PRD.md',
	];

	let allClean = true;
	let fileCount = 0;

	for (const target of targets) {
		const files = findFiles(target);
		for (const file of files) {
			fileCount++;
			const isClean = checkFile(file);
			if (!isClean) {
				allClean = false;
			}
		}
	}

	if (!allClean) {
		console.error(`ASCII check failed.`);
		process.exit(1);
	}

	console.log(`ASCII check passed: ${fileCount} files scanned, all ASCII.`);
}

runAsciiCheck();
