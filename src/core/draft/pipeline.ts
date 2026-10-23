import * as fs from 'node:fs';
import * as path from 'node:path';
import { buildLedger } from '../ledger/ledger';
import { scanRepo } from '../ledger/scan';
import {
	flushTelemetry,
	initTelemetry,
	withSpan,
} from '../telemetry/telemetry';
import { verifyClaims } from '../verifier/verifier';
import { VerifiedClaim } from '../verifier/types';
import { generateDraft, GenerateDraftOptions } from './generator';
import {
	ClaimCounts,
	Draft,
	extractClaimsFromDraft,
	PipelineResult,
	RunRecord,
	StageTimings,
} from './types';

export interface PipelineOptions extends GenerateDraftOptions {
	runsDir?: string;
}

export interface PipelineResultWithMarkdown extends PipelineResult {
	markdown: string;
}

export function formatDraftMarkdown(
	draft: Draft,
	verifiedClaims: VerifiedClaim[]
): string {
	const statusMap = new Map<string, VerifiedClaim>();
	for (const v of verifiedClaims) {
		statusMap.set(v.claim_id, v);
	}

	const paragraphTexts: string[] = [];

	for (const p of draft.paragraphs) {
		const sentenceTexts: string[] = [];
		for (const c of p.claims) {
			const v = statusMap.get(c.claim_id);
			if (!v || v.status === 'needs_input') {
				const reason = v?.reason ? v.reason : 'needs input';
				sentenceTexts.push(`[NEEDS INPUT: ${reason}]`);
			} else {
				sentenceTexts.push(c.text);
			}
		}
		if (sentenceTexts.length > 0) {
			paragraphTexts.push(sentenceTexts.join(' '));
		}
	}

	if (paragraphTexts.length === 0 && verifiedClaims.length > 0) {
		return verifiedClaims
			.map((v) =>
				v.status === 'needs_input'
					? `[NEEDS INPUT: ${v.reason || 'needs input'}]`
					: v.text
			)
			.join(' ');
	}

	return paragraphTexts.join('\n\n');
}

export function exportDraftMarkdown(
	draft: Draft,
	verifiedClaims: VerifiedClaim[]
): string {
	return withSpan('sloth_scribe.export', (span) => {
		const exportStart = performance.now();
		const md = formatDraftMarkdown(draft, verifiedClaims);
		const duration = Math.round(performance.now() - exportStart);

		span.setAttribute('claim_count', verifiedClaims.length);
		span.setAttribute('char_count', md.length);
		span.setAttribute('duration_ms', duration);
		span.setAttribute('error', false);
		span.setStatus('ok');

		return md;
	});
}

export async function runPipeline(
	repoPath: string,
	modelOverride?: string,
	options?: PipelineOptions
): Promise<PipelineResultWithMarkdown> {
	// Initialize telemetry if configured; no-op if SENTRY_DSN is empty
	initTelemetry();

	// Stage 1: scan
	const scanStart = performance.now();
	const scan = await withSpan('sloth_scribe.scan', async (span) => {
		const res = scanRepo(repoPath);
		const duration = Math.round(performance.now() - scanStart);
		span.setAttribute('commit_count', res.commits.length);
		span.setAttribute('file_count', res.files.length);
		span.setAttribute('duration_ms', duration);
		span.setAttribute('error', false);
		span.setStatus('ok');
		return res;
	});
	const scanDuration = Math.round(performance.now() - scanStart);

	// Stage 2: ledger
	const ledgerStart = performance.now();
	const ledger = await withSpan('sloth_scribe.ledger', async (span) => {
		const res = buildLedger(scan);
		const duration = Math.round(performance.now() - ledgerStart);
		span.setAttribute('fact_count', res.length);
		span.setAttribute('duration_ms', duration);
		span.setAttribute('error', false);
		span.setStatus('ok');
		return res;
	});
	const ledgerDuration = Math.round(performance.now() - ledgerStart);

	// Stage 3: generate
	const generateStart = performance.now();
	const genResult = await withSpan('sloth_scribe.generate', async (span) => {
		const res = await generateDraft(ledger, {
			modelOverride,
			ollamaHost: options?.ollamaHost,
			timeoutMs: options?.timeoutMs,
			fetchFn: options?.fetchFn,
		});
		const duration = Math.round(performance.now() - generateStart);
		span.setAttribute('model', res.modelUsed);
		span.setAttribute('fallback_used', res.fallbackUsed);
		span.setAttribute('duration_ms', duration);
		if (
			res.ollamaMetrics.prompt_eval_count !== undefined &&
			res.ollamaMetrics.prompt_eval_count !== null
		) {
			span.setAttribute('prompt_eval_count', res.ollamaMetrics.prompt_eval_count);
		}
		if (
			res.ollamaMetrics.eval_count !== undefined &&
			res.ollamaMetrics.eval_count !== null
		) {
			span.setAttribute('eval_count', res.ollamaMetrics.eval_count);
		}
		span.setAttribute('error', false);
		span.setStatus('ok');
		return res;
	});
	const generateDuration = Math.round(performance.now() - generateStart);

	// Stage 4: verify
	const verifyStart = performance.now();
	const { claims, verifiedClaims, claimCounts } = await withSpan(
		'sloth_scribe.verify',
		async (span) => {
			const extractedClaims = extractClaimsFromDraft(genResult.draft);
			const verified = verifyClaims(extractedClaims, ledger);
			const duration = Math.round(performance.now() - verifyStart);

			const counts: ClaimCounts = {
				verified: 0,
				interpretation: 0,
				needs_input: 0,
				total: verified.length,
			};

			for (const v of verified) {
				counts[v.status]++;
			}

			span.setAttribute('claim_count', verified.length);
			span.setAttribute('verified_count', counts.verified);
			span.setAttribute('interpretation_count', counts.interpretation);
			span.setAttribute('needs_input_count', counts.needs_input);
			span.setAttribute('duration_ms', duration);
			span.setAttribute('error', false);
			span.setStatus('ok');

			return {
				claims: extractedClaims,
				verifiedClaims: verified,
				claimCounts: counts,
			};
		}
	);
	const verifyDuration = Math.round(performance.now() - verifyStart);

	// Stage 5: export
	const markdown = exportDraftMarkdown(genResult.draft, verifiedClaims);

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

	// Flush telemetry if enabled
	await flushTelemetry();

	return {
		draft: genResult.draft,
		claims,
		verifiedClaims,
		ledger,
		runRecord,
		recordPath,
		markdown,
	};
}
