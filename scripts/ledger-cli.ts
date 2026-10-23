import { buildLedger } from '../src/core/ledger/ledger';
import { scanRepo } from '../src/core/ledger/scan';
import { ScanError } from '../src/core/ledger/types';

function runCli(): void {
	const rawArgs = process.argv.slice(2);
	const args = rawArgs.filter((arg) => arg !== '--');
	const targetPath = args[0];

	if (!targetPath) {
		console.error('ScanError [REPO_NOT_FOUND]: Repository path is required.');
		process.exit(1);
	}

	try {
		const scan = scanRepo(targetPath);
		const ledger = buildLedger(scan);
		process.stdout.write(JSON.stringify(ledger, null, '\t') + '\n');
	} catch (err: unknown) {
		if (err instanceof ScanError) {
			console.error(`${err.name} [${err.code}]: ${err.message}`);
			process.exit(1);
		}
		const msg = err instanceof Error ? err.message : String(err);
		console.error(`Error: ${msg}`);
		process.exit(1);
	}
}

runCli();
