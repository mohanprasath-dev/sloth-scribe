import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { exportDraftMarkdown, runPipeline } from '../draft/pipeline';
import { Draft } from '../draft/types';
import {
	closeTelemetry,
	flushTelemetry,
	initTelemetry,
	isTelemetryEnabled,
	withSpan,
} from './telemetry';
import { TelemetrySpan } from './types';

interface FakeSpanItem {
	name: string;
	attributes: Record<string, unknown>;
	status?: string;
}

interface FakeEnvelope {
	items: FakeSpanItem[];
	raw: unknown;
}

describe('Telemetry & Sentry Agent Tracing', () => {
	const capturedEnvelopes: unknown[] = [];
	const capturedSpans: FakeSpanItem[] = [];

	function fakeTransport() {
		return {
			send: (envelope: unknown) => {
				capturedEnvelopes.push(envelope);
				if (Array.isArray(envelope) && Array.isArray(envelope[1])) {
					for (const item of envelope[1]) {
						if (Array.isArray(item) && item[0]?.type === 'span' && item[1]?.items) {
							for (const s of item[1].items) {
								const attributes: Record<string, unknown> = {};
								if (s.attributes) {
									for (const [k, v] of Object.entries(s.attributes)) {
										if (v && typeof v === 'object' && 'value' in v) {
											attributes[k] = (v as { value: unknown }).value;
										} else {
											attributes[k] = v;
										}
									}
								}
								capturedSpans.push({
									name: s.name,
									attributes,
									status: s.status,
								});
							}
						}
					}
				}
				return Promise.resolve();
			},
			flush: () => Promise.resolve(true),
		};
	}

	beforeEach(() => {
		capturedEnvelopes.length = 0;
		capturedSpans.length = 0;
	});

	afterEach(async () => {
		await closeTelemetry();
		capturedEnvelopes.length = 0;
		capturedSpans.length = 0;
	});

	it('stays disabled and acts as no-op when SENTRY_DSN is empty', async () => {
		const initialized = initTelemetry({ dsn: '' });
		expect(initialized).toBe(false);
		expect(isTelemetryEnabled()).toBe(false);

		let executed = false;
		const result = withSpan('sloth_scribe.scan', (span: TelemetrySpan) => {
			executed = true;
			span.setAttribute('commit_count', 14);
			return 'no-op-result';
		});

		expect(executed).toBe(true);
		expect(result).toBe('no-op-result');

		const flushed = await flushTelemetry();
		expect(flushed).toBe(true);
		expect(capturedEnvelopes.length).toBe(0);
	});

	it('initializes cleanly with non-empty DSN and enables telemetry', async () => {
		const initialized = initTelemetry({
			dsn: 'https://public@example.com/1',
			transport: fakeTransport as unknown as undefined,
		});

		expect(initialized).toBe(true);
		expect(isTelemetryEnabled()).toBe(true);
	});

	it('drops non-whitelisted attributes to prevent sensitive data leakage', async () => {
		initTelemetry({
			dsn: 'https://public@example.com/1',
			transport: fakeTransport as unknown as undefined,
		});

		withSpan('sloth_scribe.scan', (span: TelemetrySpan) => {
			span.setAttribute('commit_count', 14);
			// Forbidden attributes
			span.setAttribute('commit_subject', 'add task store foundation');
			span.setAttribute('repo_text', 'const secret = 123;');
			span.setAttribute('ledger_value', 'seed metric 60%');
		});

		await flushTelemetry();

		expect(capturedSpans.length).toBe(1);
		const span = capturedSpans[0];
		expect(span.name).toBe('sloth_scribe.scan');
		expect(span.attributes.commit_count).toBe(14);
		expect(span.attributes.commit_subject).toBeUndefined();
		expect(span.attributes.repo_text).toBeUndefined();
		expect(span.attributes.ledger_value).toBeUndefined();
	});

	it('records error flag and status on failure without leaking error details', async () => {
		initTelemetry({
			dsn: 'https://public@example.com/1',
			transport: fakeTransport as unknown as undefined,
		});

		await expect(
			withSpan('sloth_scribe.scan', async (span: TelemetrySpan) => {
				span.setAttribute('file_count', 5);
				throw new Error('Fatal error reading /path/to/private/repo/file.js');
			})
		).rejects.toThrow('Fatal error reading /path/to/private/repo/file.js');

		await flushTelemetry();

		expect(capturedSpans.length).toBe(1);
		const span = capturedSpans[0];
		expect(span.name).toBe('sloth_scribe.scan');
		expect(span.attributes.error).toBe(true);
		expect(span.status).toBe('error');

		const serialized = JSON.stringify(capturedEnvelopes);
		expect(serialized).not.toContain('/path/to/private/repo/file.js');
	});

	it('wraps export stage and formats markdown with needs_input placeholders', () => {
		initTelemetry({
			dsn: 'https://public@example.com/1',
			transport: fakeTransport as unknown as undefined,
		});

		const dummyDraft: Draft = {
			paragraphs: [
				{
					claims: [
						{
							claim_id: 'c1',
							text: 'There were 14 commits.',
							type: 'count',
							fact_ids: ['F002'],
						},
						{
							claim_id: 'c2',
							text: 'Cuts build time by 60%.',
							type: 'metric',
							fact_ids: ['F044'],
						},
					],
				},
			],
		};

		const verifiedClaims = [
			{
				claim_id: 'c1',
				text: 'There were 14 commits.',
				type: 'count' as const,
				fact_ids: ['F002'],
				status: 'verified' as const,
				reason: 'verified commit count of 14',
				evidence: [{ fact_id: 'F002', location: 'git:log' }],
			},
			{
				claim_id: 'c2',
				text: 'Cuts build time by 60%.',
				type: 'metric' as const,
				fact_ids: ['F044'],
				status: 'needs_input' as const,
				reason: 'metric needs measured evidence',
				evidence: [],
			},
		];

		const markdown = exportDraftMarkdown(dummyDraft, verifiedClaims);
		expect(markdown).toContain('There were 14 commits.');
		expect(markdown).toContain('[NEEDS INPUT: metric needs measured evidence]');
		expect(markdown).not.toContain('Cuts build time by 60%.');
	});

	it('runs pipeline on fixture with mocked model, captures exactly 5 spans, and leaks zero payloads', async () => {
		// Initialize telemetry with fake transport
		initTelemetry({
			dsn: 'https://public@example.com/1',
			transport: fakeTransport as unknown as undefined,
		});

		const repoPath = path.resolve('fixtures/demo-repo');
		expect(fs.existsSync(repoPath)).toBe(true);

		// Read expected fixture ground truth
		const expectedRaw = fs.readFileSync(path.resolve('fixtures/expected.json'), 'utf8');
		const expected = JSON.parse(expectedRaw);

		// Mock model response with claims including the seeded 60% metric claim
		const mockDraft: Draft = {
			paragraphs: [
				{
					claims: [
						{
							claim_id: 'c1',
							text: 'There were 14 commits made.',
							type: 'count',
							fact_ids: ['F002'],
						},
						{
							claim_id: 'c2',
							text: 'Implemented CSV export for task lists in `src/export.js`.',
							type: 'feature',
							fact_ids: ['F013', 'F036'],
						},
						{
							claim_id: 'c3',
							text: 'Cuts build time by 60% compared to old pipeline.',
							type: 'metric',
							fact_ids: ['F044'],
						},
					],
				},
			],
		};

		const mockOllamaResponse = {
			model: 'gemma3:4b-it-q4_K_M',
			message: {
				role: 'assistant',
				content: JSON.stringify(mockDraft),
			},
			done: true,
			prompt_eval_count: 512,
			eval_count: 85,
			total_duration: 1200000000,
		};

		const mockFetch = async () =>
			new Response(JSON.stringify(mockOllamaResponse), {
				status: 200,
				headers: { 'content-type': 'application/json' },
			});

		// Run full pipeline
		const result = await runPipeline(repoPath, 'gemma3:4b-it-q4_K_M', {
			fetchFn: mockFetch as unknown as typeof fetch,
			runsDir: path.resolve('runs'),
		});

		expect(result).toBeDefined();
		expect(result.claims.length).toBe(3);
		expect(result.verifiedClaims.length).toBe(3);
		expect(result.markdown).toContain('There were 14 commits made.');
		expect(result.markdown).toContain('[NEEDS INPUT: metric needs measured evidence]');

		await flushTelemetry();

		// Assert exactly five spans captured
		expect(capturedSpans.length).toBe(5);

		const expectedSpanNames = [
			'sloth_scribe.scan',
			'sloth_scribe.ledger',
			'sloth_scribe.generate',
			'sloth_scribe.verify',
			'sloth_scribe.export',
		];

		const actualSpanNames = capturedSpans.map((s) => s.name);
		expect(actualSpanNames).toEqual(expectedSpanNames);

		// Verify span attributes
		const scanSpan = capturedSpans[0];
		expect(scanSpan.attributes.commit_count).toBe(14);
		expect(scanSpan.attributes.file_count).toBeGreaterThan(0);
		expect(scanSpan.attributes.duration_ms).toBeGreaterThanOrEqual(0);
		expect(scanSpan.attributes.error).toBe(false);

		const ledgerSpan = capturedSpans[1];
		expect(ledgerSpan.attributes.fact_count).toBeGreaterThan(0);
		expect(ledgerSpan.attributes.duration_ms).toBeGreaterThanOrEqual(0);
		expect(ledgerSpan.attributes.error).toBe(false);

		const genSpan = capturedSpans[2];
		expect(genSpan.attributes.model).toBe('gemma3:4b-it-q4_K_M');
		expect(genSpan.attributes.fallback_used).toBe(false);
		expect(genSpan.attributes.prompt_eval_count).toBe(512);
		expect(genSpan.attributes.eval_count).toBe(85);
		expect(genSpan.attributes.duration_ms).toBeGreaterThanOrEqual(0);
		expect(genSpan.attributes.error).toBe(false);

		const verifySpan = capturedSpans[3];
		expect(verifySpan.attributes.claim_count).toBe(3);
		expect(verifySpan.attributes.verified_count).toBe(2);
		expect(verifySpan.attributes.needs_input_count).toBe(1);
		expect(verifySpan.attributes.duration_ms).toBeGreaterThanOrEqual(0);
		expect(verifySpan.attributes.error).toBe(false);

		const exportSpan = capturedSpans[4];
		expect(exportSpan.attributes.claim_count).toBe(3);
		expect(exportSpan.attributes.char_count).toBeGreaterThan(0);
		expect(exportSpan.attributes.duration_ms).toBeGreaterThanOrEqual(0);
		expect(exportSpan.attributes.error).toBe(false);

		// Stringify all captured envelope payloads
		const capturedPayloadsString = JSON.stringify(capturedEnvelopes);

		// Assert NO commit subject from fixture appears anywhere in captured payloads
		for (const commit of expected.commits) {
			expect(capturedPayloadsString).not.toContain(commit.subject);
		}

		// Assert NO claim text appears anywhere in captured payloads
		for (const p of mockDraft.paragraphs) {
			for (const c of p.claims) {
				expect(capturedPayloadsString).not.toContain(c.text);
			}
		}

		// Assert NO prompt text or ledger values appear anywhere in captured payloads
		expect(capturedPayloadsString).not.toContain('You are a draft generator');
		expect(capturedPayloadsString).not.toContain('evidence-constrained');
		expect(capturedPayloadsString).not.toContain('Cuts build time by 60%');
		expect(capturedPayloadsString).not.toContain('dark mode');
		expect(capturedPayloadsString).not.toContain('src/store.js');
		expect(capturedPayloadsString).not.toContain('src/export.js');
		expect(capturedPayloadsString).not.toContain('tinytasks');
	});
});
