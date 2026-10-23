import * as fs from 'node:fs';
import * as path from 'node:path';
import { config } from '../src/core/config';
import { PipelineResultWithMarkdown, runPipeline } from '../src/core/draft/pipeline';
import { Fact } from '../src/core/ledger/types';
import { Claim, VerifiedClaim } from '../src/core/verifier/types';
import { verifyClaims } from '../src/core/verifier/verifier';

interface ModelSummary {
	model: string;
	scanMs: number;
	ledgerMs: number;
	generateMs: number;
	verifyMs: number;
	totalMs: number;
	verified: number;
	interpretation: number;
	needsInput: number;
	totalClaims: number;
	recordPath: string;
}

function findFactId(ledger: Fact[], predicate: (f: Fact) => boolean): string {
	const found = ledger.find(predicate);
	if (!found) {
		throw new Error('Required ledger fact not found');
	}
	return found.id;
}

function assertSeededClaims(result: PipelineResultWithMarkdown, modelLabel: string): void {
	const ledger = result.ledger;

	// Resolve the fact ids from the live ledger to test seeded claim rejection
	const commitTotalId = findFactId(ledger, (f) => f.type === 'commit_total');
	const metricFactId = findFactId(
		ledger,
		(f) =>
			f.type === 'readme_line' &&
			typeof f.value === 'object' &&
			f.value !== null &&
			'text' in f.value &&
			typeof (f.value as { text: string }).text === 'string' &&
			(f.value as { text: string }).text.includes('60%')
	);
	const darkModeFactId = findFactId(
		ledger,
		(f) =>
			f.type === 'readme_line' &&
			typeof f.value === 'object' &&
			f.value !== null &&
			'text' in f.value &&
			typeof (f.value as { text: string }).text === 'string' &&
			(f.value as { text: string }).text.toLowerCase().includes('dark mode')
	);

	// Canonical seeded claims that must always fail verification
	const seededClaims: Claim[] = [
		{
			claim_id: 'seeded-metric-60',
			text: 'Cuts build time by 60% compared to the old pipeline.',
			type: 'metric',
			fact_ids: [metricFactId],
		},
		{
			claim_id: 'seeded-dark-mode',
			text: 'The application features built-in dark mode support.',
			type: 'feature',
			fact_ids: [darkModeFactId],
		},
		{
			claim_id: 'seeded-wrong-count',
			text: 'The repository contains a total of 13 commits.',
			type: 'count',
			fact_ids: [commitTotalId],
		},
	];

	const seededVerdicts = verifyClaims(seededClaims, ledger);
	for (const v of seededVerdicts) {
		if (v.status !== 'needs_input') {
			throw new Error(
				`[${modelLabel}] Expected seeded claim ${v.claim_id} to be NEEDS_INPUT, got ${v.status} (${v.reason})`
			);
		}
	}

	// Assert that verified claims produced by the model never include the seeded false claims
	const verifiedList = result.verifiedClaims.filter((c: VerifiedClaim) => c.status === 'verified');
	for (const v of verifiedList) {
		if (v.text.includes('60%')) {
			throw new Error(`[${modelLabel}] Verified claims include 60% metric: "${v.text}"`);
		}
		if (/dark\s*mode/i.test(v.text)) {
			throw new Error(`[${modelLabel}] Verified claims include dark mode: "${v.text}"`);
		}
		if (/\b13\s+commit/i.test(v.text)) {
			throw new Error(`[${modelLabel}] Verified claims include wrong commit count: "${v.text}"`);
		}
	}

	// If the model drafted any claims matching the seeded topics, ensure they were marked NEEDS_INPUT
	for (const c of result.verifiedClaims) {
		if (c.text.includes('60%') && c.status !== 'needs_input') {
			throw new Error(`[${modelLabel}] Model claim with 60% was not marked NEEDS_INPUT: status=${c.status}`);
		}
		if (/dark\s*mode/i.test(c.text) && c.status !== 'needs_input') {
			throw new Error(`[${modelLabel}] Model claim with dark mode was not marked NEEDS_INPUT: status=${c.status}`);
		}
		if (/\b13\s+commit/i.test(c.text) && c.status !== 'needs_input') {
			throw new Error(`[${modelLabel}] Model claim with 13 commits was not marked NEEDS_INPUT: status=${c.status}`);
		}
	}
}

function pad(str: string, width: number, alignRight = false): string {
	if (str.length >= width) {
		return str;
	}
	const spaces = ' '.repeat(width - str.length);
	return alignRight ? spaces + str : str + spaces;
}

function printTable(rows: ModelSummary[]): void {
	const colModel = 21;
	const colTime = 10;
	const colCount = 10;

	const sep =
		'+-' +
		'-'.repeat(colModel) +
		'-+-' +
		'-'.repeat(colTime) +
		'-+-' +
		'-'.repeat(colTime) +
		'-+-' +
		'-'.repeat(colTime) +
		'-+-' +
		'-'.repeat(colTime) +
		'-+-' +
		'-'.repeat(colTime) +
		'-+-' +
		'-'.repeat(colCount) +
		'-+-' +
		'-'.repeat(colCount) +
		'-+-' +
		'-'.repeat(colCount) +
		'-+-' +
		'-'.repeat(colCount) +
		'-+';

	console.log(sep);
	console.log(
		'| ' +
		pad('Model', colModel) +
		' | ' +
		pad('Scan', colTime, true) +
		' | ' +
		pad('Ledger', colTime, true) +
		' | ' +
		pad('Generate', colTime, true) +
		' | ' +
		pad('Verify', colTime, true) +
		' | ' +
		pad('Total', colTime, true) +
		' | ' +
		pad('Verified', colCount, true) +
		' | ' +
		pad('Interp', colCount, true) +
		' | ' +
		pad('Needs In', colCount, true) +
		' | ' +
		pad('Claims', colCount, true) +
		' |'
	);
	console.log(sep);

	for (const r of rows) {
		console.log(
			'| ' +
			pad(r.model, colModel) +
			' | ' +
			pad(`${r.scanMs}ms`, colTime, true) +
			' | ' +
			pad(`${r.ledgerMs}ms`, colTime, true) +
			' | ' +
			pad(`${r.generateMs}ms`, colTime, true) +
			' | ' +
			pad(`${r.verifyMs}ms`, colTime, true) +
			' | ' +
			pad(`${r.totalMs}ms`, colTime, true) +
			' | ' +
			pad(String(r.verified), colCount, true) +
			' | ' +
			pad(String(r.interpretation), colCount, true) +
			' | ' +
			pad(String(r.needsInput), colCount, true) +
			' | ' +
			pad(String(r.totalClaims), colCount, true) +
			' |'
		);
	}
	console.log(sep);
}

async function main(): Promise<void> {
	const repoPath = path.resolve('fixtures/demo-repo');
	if (!fs.existsSync(repoPath)) {
		console.error('fixtures/demo-repo not found. Run npm run fixture first.');
		process.exit(1);
	}

	console.log('Running model swap check...');
	console.log(`Primary model:  ${config.MODEL_PRIMARY}`);
	console.log(`Fallback model: ${config.MODEL_FALLBACK}`);
	console.log('');

	// Run 1: MODEL_PRIMARY
	console.log(`Executing pipeline with MODEL_PRIMARY (${config.MODEL_PRIMARY})...`);
	const primaryResult = await runPipeline(repoPath, config.MODEL_PRIMARY);
	assertSeededClaims(primaryResult, 'PRIMARY');
	console.log('Primary model run passed seeded claim assertions.');

	// Run 2: MODEL_FALLBACK
	console.log(`Executing pipeline with MODEL_FALLBACK (${config.MODEL_FALLBACK})...`);
	const fallbackResult = await runPipeline(repoPath, config.MODEL_FALLBACK);
	assertSeededClaims(fallbackResult, 'FALLBACK');
	console.log('Fallback model run passed seeded claim assertions.');
	console.log('');

	const rows: ModelSummary[] = [
		{
			model: primaryResult.runRecord.model,
			scanMs: primaryResult.runRecord.timings.scan,
			ledgerMs: primaryResult.runRecord.timings.ledger,
			generateMs: primaryResult.runRecord.timings.generate,
			verifyMs: primaryResult.runRecord.timings.verify,
			totalMs: primaryResult.runRecord.timings.total,
			verified: primaryResult.runRecord.claim_counts.verified,
			interpretation: primaryResult.runRecord.claim_counts.interpretation,
			needsInput: primaryResult.runRecord.claim_counts.needs_input,
			totalClaims: primaryResult.runRecord.claim_counts.total,
			recordPath: primaryResult.recordPath,
		},
		{
			model: fallbackResult.runRecord.model,
			scanMs: fallbackResult.runRecord.timings.scan,
			ledgerMs: fallbackResult.runRecord.timings.ledger,
			generateMs: fallbackResult.runRecord.timings.generate,
			verifyMs: fallbackResult.runRecord.timings.verify,
			totalMs: fallbackResult.runRecord.timings.total,
			verified: fallbackResult.runRecord.claim_counts.verified,
			interpretation: fallbackResult.runRecord.claim_counts.interpretation,
			needsInput: fallbackResult.runRecord.claim_counts.needs_input,
			totalClaims: fallbackResult.runRecord.claim_counts.total,
			recordPath: fallbackResult.recordPath,
		},
	];

	printTable(rows);
	console.log('');
	console.log('Runs written to:');
	console.log(`  - ${rows[0].recordPath}`);
	console.log(`  - ${rows[1].recordPath}`);
}

main().catch((err) => {
	console.error('model-swap-check failed:', err instanceof Error ? err.message : String(err));
	process.exit(1);
});
