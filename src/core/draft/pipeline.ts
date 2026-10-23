import * as fs from 'node:fs';
import * as path from 'node:path';
import { buildLedger } from '../ledger/ledger';
import { scanRepo } from '../ledger/scan';
import { verifyClaims } from '../verifier/verifier';
import { generateDraft, GenerateDraftOptions } from './generator';
import {
	ClaimCounts,
	extractClaimsFromDraft,
	PipelineResult,
	RunRecord,
	StageTimings,
} from './types';

export interface PipelineOptions extends GenerateDraftOptions {
	runsDir?: string;
}

export async function runPipeline(
	repoPath: string,
	modelOverride?: string,
	options?: PipelineOptions
): Promise<PipelineResult> {
	// Stage 1: scan
	const scanStart = performance.now();
	const scan = scanRepo(repoPath);
	const scanDuration = Math.round(performance.now() - scanStart);

	// Stage 2: ledger
	const ledgerStart = performance.now();
	const ledger = buildLedger(scan);
	const ledgerDuration = Math.round(performance.now() - ledgerStart);

	// Stage 3: generate
	const generateStart = performance.now();
	const genResult = await generateDraft(ledger, {
		modelOverride,
		ollamaHost: options?.ollamaHost,
		timeoutMs: options?.timeoutMs,
		fetchFn: options?.fetchFn,
	});
	const generateDuration = Math.round(performance.now() - generateStart);

	// Stage 4: verify
	const verifyStart = performance.now();
	const claims = extractClaimsFromDraft(genResult.draft);
	const verifiedClaims = verifyClaims(claims, ledger);
	const verifyDuration = Math.round(performance.now() - verifyStart);

	const claimCounts: ClaimCounts = {
		verified: 0,
		interpretation: 0,
		needs_input: 0,
		total: verifiedClaims.length,
	};

	for (const v of verifiedClaims) {
		claimCounts[v.status]++;
	}

	const timings: StageTimings = {
		scan: scanDuration,
		ledger: ledgerDuration,
		generate: generateDuration,
		verify: verifyDuration,
		total: scanDuration + ledgerDuration + generateDuration + verifyDuration,
	};

	const timestamp = new Date().toISOString();
	const runRecord: RunRecord = {
		timestamp,
		model: genResult.modelUsed,
		fallback_used: genResult.fallbackUsed,
		fallback_reason: genResult.fallbackReason,
		timings,
		ollama: {
			prompt_eval_count:
				genResult.ollamaMetrics.prompt_eval_count !== undefined
					? genResult.ollamaMetrics.prompt_eval_count
					: null,
			eval_count:
				genResult.ollamaMetrics.eval_count !== undefined
					? genResult.ollamaMetrics.eval_count
					: null,
			total_duration:
				genResult.ollamaMetrics.total_duration !== undefined
					? genResult.ollamaMetrics.total_duration
					: null,
		},
		claim_counts: claimCounts,
	};

	// Ensure runs/ directory is created if it does not exist
	const runsDir = options?.runsDir || path.resolve('runs');
	if (!fs.existsSync(runsDir)) {
		fs.mkdirSync(runsDir, { recursive: true });
	}

	const safeTimestamp = timestamp.replace(/:/g, '-');
	const safeModel = genResult.modelUsed.replace(/[:\/\\*?"<>|]/g, '-');
	const recordPath = path.join(runsDir, `${safeTimestamp}-${safeModel}.json`);

	fs.writeFileSync(
		recordPath,
		JSON.stringify(runRecord, null, '\t') + '\n',
		'utf8'
	);

	return {
		draft: genResult.draft,
		claims,
		verifiedClaims,
		ledger,
		runRecord,
		recordPath,
	};
}
