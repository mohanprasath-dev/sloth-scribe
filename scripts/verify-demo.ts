import * as fs from 'node:fs';
import * as path from 'node:path';
import { buildLedger } from '../src/core/ledger/ledger';
import { scanRepo } from '../src/core/ledger/scan';
import { Claim } from '../src/core/verifier/types';
import { verifyClaims } from '../src/core/verifier/verifier';

function runVerifyDemo(): void {
	const repoPath = path.resolve('fixtures/demo-repo');
	if (!fs.existsSync(repoPath)) {
		console.error(`Repository fixtures/demo-repo not found. Run npm run fixture first.`);
		process.exit(1);
	}

	const scan = scanRepo(repoPath);
	const ledger = buildLedger(scan);

	const handwrittenPath = path.resolve('fixtures/drafts/handwritten.json');
	if (!fs.existsSync(handwrittenPath)) {
		console.error(`File ${handwrittenPath} not found.`);
		process.exit(1);
	}

	const claimsRaw = fs.readFileSync(handwrittenPath, 'utf8');
	const claims = JSON.parse(claimsRaw) as Claim[];

	const expectedPath = path.resolve(
		'fixtures/drafts/handwritten.expected.json'
	);
	if (!fs.existsSync(expectedPath)) {
		console.error(`File ${expectedPath} not found.`);
		process.exit(1);
	}

	const expectedRaw = fs.readFileSync(expectedPath, 'utf8');
	const expectedVerdicts = JSON.parse(expectedRaw) as Record<string, string>;

	const verifiedList = verifyClaims(claims, ledger);

	const counts = {
		verified: 0,
		interpretation: 0,
		needs_input: 0,
	};

	let hasMismatch = false;

	for (const v of verifiedList) {
		counts[v.status]++;

		const evidenceStr =
			v.evidence.length > 0
				? v.evidence.map((e) => e.location).join(', ')
				: 'none';

		const statusUpper = v.status.toUpperCase();
		console.log(
			`${v.claim_id} ${statusUpper} | ${v.text} | ${v.reason} | evidence: ${evidenceStr}`
		);

		const expected = expectedVerdicts[v.claim_id];
		if (expected && expected !== v.status) {
			console.error(
				`MISMATCH for ${v.claim_id}: expected ${expected}, got ${v.status}`
			);
			hasMismatch = true;
		}
	}

	console.log(
		`\nCounts: VERIFIED: ${counts.verified}, INTERPRETATION: ${counts.interpretation}, NEEDS_INPUT: ${counts.needs_input}`
	);

	if (hasMismatch) {
		console.error('Verification failed: one or more claims did not match expected verdicts.');
		process.exit(1);
	}

	console.log('All claim verdicts match expected.');
	process.exit(0);
}

runVerifyDemo();
