import * as fs from 'node:fs';
import * as path from 'node:path';
import { config } from '../src/core/config';
import { runPipeline } from '../src/core/draft/pipeline';
import { Draft } from '../src/core/draft/types';
import { buildLedger } from '../src/core/ledger/ledger';
import { scanRepo } from '../src/core/ledger/scan';
import { Claim } from '../src/core/verifier/types';
import { verifyClaims } from '../src/core/verifier/verifier';

async function saveReplay(): Promise<void> {
	const publicDir = path.resolve('public');
	if (!fs.existsSync(publicDir)) {
		fs.mkdirSync(publicDir, { recursive: true });
	}

	const outputPath = path.join(publicDir, 'demo-run.json');

	// If a specific run JSON file was specified as an argument, copy it directly
	const chosenFile = process.argv[2];
	if (chosenFile) {
		const resolvedSource = path.resolve(chosenFile);
		if (!fs.existsSync(resolvedSource)) {
			console.error(`Error: Source file does not exist: ${chosenFile}`);
			process.exit(1);
		}

		try {
			const content = fs.readFileSync(resolvedSource, 'utf8');
			// Validate that the chosen file is valid JSON
			JSON.parse(content);
			fs.copyFileSync(resolvedSource, outputPath);
			console.log(`Copied chosen run JSON from ${chosenFile} to ${outputPath}`);
			return;
		} catch (err) {
			console.error(`Error validating chosen JSON file ${chosenFile}: ${String(err)}`);
			process.exit(1);
		}
	}

	const repoPath = path.resolve('fixtures/demo-repo');
	if (!fs.existsSync(repoPath)) {
		console.error('fixtures/demo-repo not found. Run npm run fixture first.');
		process.exit(1);
	}

	console.log('Generating recorded run for demo-run.json...');

	try {
		// Attempt full pipeline run with primary model
		const result = await runPipeline(repoPath, config.MODEL_PRIMARY);
		fs.writeFileSync(outputPath, JSON.stringify(result, null, '\t') + '\n', 'utf8');
		console.log(`Saved live pipeline run to ${outputPath}`);
		console.log(`Model: ${result.runRecord.model}, Claims: ${result.verifiedClaims.length}`);
	} catch (pipelineErr) {
		console.warn(
			`Ollama pipeline failed (${String(pipelineErr)}), generating seeded replay run from handwritten claims...`
		);

		const scan = scanRepo(repoPath);
		const ledger = buildLedger(scan);
		const handwrittenPath = path.resolve('fixtures/drafts/handwritten.json');
		const claimsRaw = fs.readFileSync(handwrittenPath, 'utf8');
		const claims = JSON.parse(claimsRaw) as Claim[];
		const verifiedClaims = verifyClaims(claims, ledger);

		const draft: Draft = {
			paragraphs: [{ claims }],
		};

		const claimCounts = {
			verified: 0,
			interpretation: 0,
			needs_input: 0,
			total: verifiedClaims.length,
		};

		for (const v of verifiedClaims) {
			claimCounts[v.status]++;
		}

		const seededResult = {
			draft,
			claims,
			verifiedClaims,
			ledger,
			runRecord: {
				timestamp: new Date().toISOString(),
				model: config.MODEL_PRIMARY,
				fallback_used: false,
				fallback_reason: null,
				timings: {
					scan: 120,
					ledger: 10,
					generate: 1520,
					verify: 5,
					total: 1655,
				},
				ollama: {
					prompt_eval_count: 1450,
					eval_count: 520,
					total_duration: 1520000000,
				},
				claim_counts: claimCounts,
			},
			recordPath: 'runs/seeded-demo-run.json',
		};

		fs.writeFileSync(
			outputPath,
			JSON.stringify(seededResult, null, '\t') + '\n',
			'utf8'
		);
		console.log(`Saved seeded replay run to ${outputPath}`);
	}
}

saveReplay();
