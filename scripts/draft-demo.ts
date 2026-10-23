import * as fs from 'node:fs';
import * as path from 'node:path';
import { runPipeline } from '../src/core/draft/pipeline';

async function main(): Promise<void> {
	const repoPath = path.resolve('fixtures/demo-repo');
	if (!fs.existsSync(repoPath)) {
		console.error(
			'Repository fixtures/demo-repo not found. Run npm run fixture first.'
		);
		process.exit(1);
	}

	try {
		const result = await runPipeline(repoPath);

		for (const v of result.verifiedClaims) {
			const evidenceStr =
				v.evidence.length > 0
					? v.evidence.map((e) => e.location).join(', ')
					: 'none';

			const statusUpper = v.status.toUpperCase();
			console.log(
				`${v.claim_id} ${statusUpper} | ${v.text} | ${v.reason} | evidence: ${evidenceStr}`
			);
		}

		console.log(
			`\nCounts: VERIFIED: ${result.runRecord.claim_counts.verified}, INTERPRETATION: ${result.runRecord.claim_counts.interpretation}, NEEDS_INPUT: ${result.runRecord.claim_counts.needs_input}`
		);

		console.log(
			`Model: ${result.runRecord.model}${result.runRecord.fallback_used ? ' (fallback used)' : ''}`
		);
		console.log(
			`Timings: scan: ${result.runRecord.timings.scan}ms, ledger: ${result.runRecord.timings.ledger}ms, generate: ${result.runRecord.timings.generate}ms, verify: ${result.runRecord.timings.verify}ms (total: ${result.runRecord.timings.total}ms)`
		);
		console.log(`Run record saved to: ${result.recordPath}`);
	} catch (err) {
		console.error(
			`Draft generation failed: ${err instanceof Error ? err.message : String(err)}`
		);
		process.exit(1);
	}
}

main();
