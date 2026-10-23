import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { config } from '../config';
import { buildLedger } from '../ledger/ledger';
import { scanRepo } from '../ledger/scan';
import { generateDraft } from './generator';
import { callOllamaChat } from './ollama';
import { runPipeline } from './pipeline';
import { Draft, DraftError, DRAFT_JSON_SCHEMA } from './types';

const MOCK_VALID_DRAFT: Draft = {
	paragraphs: [
		{
			claims: [
				{
					claim_id: 'c1',
					text: 'The repository contains a total of 14 commits.',
					type: 'count',
					fact_ids: ['F002'],
				},
				{
					claim_id: 'c2',
					text: 'The codebase demonstrates clean modular separation.',
					type: 'interpretation',
					fact_ids: [],
				},
			],
		},
	],
};

function createMockFetch(
	responses: Array<{
		ok?: boolean;
		status?: number;
		body: unknown;
		delayMs?: number;
	}>
): typeof fetch {
	let callIndex = 0;

	return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
		const current = responses[callIndex] || responses[responses.length - 1];
		callIndex++;

		if (current.delayMs && init?.signal) {
			await new Promise<void>((resolve, reject) => {
				const timer = setTimeout(() => resolve(), current.delayMs);
				init.signal?.addEventListener('abort', () => {
					clearTimeout(timer);
					const abortErr = new Error('The operation was aborted');
					abortErr.name = 'AbortError';
					reject(abortErr);
				});
			});
		}

		const isOk = current.ok !== undefined ? current.ok : true;
		const status = current.status ?? (isOk ? 200 : 500);

		const responseText =
			typeof current.body === 'string'
				? current.body
				: JSON.stringify(current.body);

		return {
			ok: isOk,
			status,
			text: async () => responseText,
			json: async () => JSON.parse(responseText),
		} as Response;
	}) as unknown as typeof fetch;
}

describe('Draft Layer', () => {
	const sampleLedger = [
		{
			id: 'F001',
			type: 'repo_name' as const,
			value: 'tinytasks',
			source: 'package.json',
			evidence_location: 'file:package.json:1-1',
		},
		{
			id: 'F002',
			type: 'commit_total' as const,
			value: 14,
			source: 'git log',
			evidence_location: 'git:log',
		},
	];

	describe('callOllamaChat', () => {
		it('returns parsed draft and Ollama metrics on valid response', async () => {
			const mockFetch = createMockFetch([
				{
					body: {
						model: config.MODEL_PRIMARY,
						message: {
							role: 'assistant',
							content: JSON.stringify(MOCK_VALID_DRAFT),
						},
						prompt_eval_count: 50,
						eval_count: 35,
						total_duration: 1200000000,
					},
				},
			]);

			const result = await callOllamaChat({
				host: 'http://localhost:11434',
				model: config.MODEL_PRIMARY,
				systemPrompt: 'System prompt',
				userPrompt: 'User prompt',
				fetchFn: mockFetch,
			});

			expect(result.draft).toEqual(MOCK_VALID_DRAFT);
			expect(result.metrics.prompt_eval_count).toBe(50);
			expect(result.metrics.eval_count).toBe(35);
			expect(result.metrics.total_duration).toBe(1200000000);
		});

		it('throws DraftError on timeout', async () => {
			const mockFetch = createMockFetch([
				{
					body: {},
					delayMs: 200,
				},
			]);

			await expect(
				callOllamaChat({
					host: 'http://localhost:11434',
					model: config.MODEL_PRIMARY,
					systemPrompt: 'System prompt',
					userPrompt: 'User prompt',
					timeoutMs: 50,
					fetchFn: mockFetch,
				})
			).rejects.toThrow(DraftError);
		});
	});

	describe('generateDraft failure handling and retry', () => {
		it('succeeds with primary model on valid output', async () => {
			const mockFetch = createMockFetch([
				{
					body: {
						model: config.MODEL_PRIMARY,
						message: {
							role: 'assistant',
							content: JSON.stringify(MOCK_VALID_DRAFT),
						},
						prompt_eval_count: 40,
						eval_count: 30,
						total_duration: 800000000,
					},
				},
			]);

			const res = await generateDraft(sampleLedger, {
				fetchFn: mockFetch,
			});

			expect(res.modelUsed).toBe(config.MODEL_PRIMARY);
			expect(res.fallbackUsed).toBe(false);
			expect(res.fallbackReason).toBeNull();
			expect(res.draft.paragraphs[0].claims.length).toBe(2);
			expect(mockFetch).toHaveBeenCalledTimes(1);
		});

		it('retries once on invalid JSON and succeeds with primary model', async () => {
			const mockFetch = createMockFetch([
				// Attempt 1: Invalid JSON content
				{
					body: {
						model: config.MODEL_PRIMARY,
						message: {
							role: 'assistant',
							content: 'Not a valid JSON string at all',
						},
					},
				},
				// Attempt 2 (retry): Valid JSON content
				{
					body: {
						model: config.MODEL_PRIMARY,
						message: {
							role: 'assistant',
							content: JSON.stringify(MOCK_VALID_DRAFT),
						},
						prompt_eval_count: 42,
						eval_count: 28,
						total_duration: 900000000,
					},
				},
			]);

			const res = await generateDraft(sampleLedger, {
				fetchFn: mockFetch,
			});

			expect(res.modelUsed).toBe(config.MODEL_PRIMARY);
			expect(res.fallbackUsed).toBe(false);
			expect(res.fallbackReason).toBeNull();
			expect(res.draft.paragraphs[0].claims.length).toBe(2);
			expect(mockFetch).toHaveBeenCalledTimes(2);
		});

		it('falls back to MODEL_FALLBACK after double invalid JSON from primary', async () => {
			const mockFetch = createMockFetch([
				// Attempt 1: primary invalid
				{
					body: {
						model: config.MODEL_PRIMARY,
						message: {
							role: 'assistant',
							content: 'bad json 1',
						},
					},
				},
				// Attempt 2: primary retry invalid
				{
					body: {
						model: config.MODEL_PRIMARY,
						message: {
							role: 'assistant',
							content: 'bad json 2',
						},
					},
				},
				// Attempt 3: fallback model valid
				{
					body: {
						model: config.MODEL_FALLBACK,
						message: {
							role: 'assistant',
							content: JSON.stringify(MOCK_VALID_DRAFT),
						},
						prompt_eval_count: 30,
						eval_count: 20,
						total_duration: 500000000,
					},
				},
			]);

			const res = await generateDraft(sampleLedger, {
				fetchFn: mockFetch,
			});

			expect(res.modelUsed).toBe(config.MODEL_FALLBACK);
			expect(res.fallbackUsed).toBe(true);
			expect(res.fallbackReason).toContain('primary model');
			expect(res.draft.paragraphs[0].claims.length).toBe(2);
			expect(mockFetch).toHaveBeenCalledTimes(3);
		});

		it('falls back to MODEL_FALLBACK on primary HTTP error', async () => {
			const mockFetch = createMockFetch([
				// Primary HTTP error (no retry, straight to fallback)
				{
					ok: false,
					status: 500,
					body: 'Internal Server Error',
				},
				// Fallback model valid
				{
					body: {
						model: config.MODEL_FALLBACK,
						message: {
							role: 'assistant',
							content: JSON.stringify(MOCK_VALID_DRAFT),
						},
						prompt_eval_count: 25,
						eval_count: 18,
						total_duration: 400000000,
					},
				},
			]);

			const res = await generateDraft(sampleLedger, {
				fetchFn: mockFetch,
			});

			expect(res.modelUsed).toBe(config.MODEL_FALLBACK);
			expect(res.fallbackUsed).toBe(true);
			expect(res.fallbackReason).toContain('Ollama HTTP error 500');
			expect(mockFetch).toHaveBeenCalledTimes(2);
		});

		it('returns typed error when both primary and fallback fail', async () => {
			const mockFetch = createMockFetch([
				// Primary attempt 1: invalid
				{
					body: {
						model: config.MODEL_PRIMARY,
						message: { role: 'assistant', content: 'bad json 1' },
					},
				},
				// Primary attempt 2: invalid
				{
					body: {
						model: config.MODEL_PRIMARY,
						message: { role: 'assistant', content: 'bad json 2' },
					},
				},
				// Fallback attempt: also invalid
				{
					body: {
						model: config.MODEL_FALLBACK,
						message: { role: 'assistant', content: 'bad fallback' },
					},
				},
			]);

			await expect(
				generateDraft(sampleLedger, {
					fetchFn: mockFetch,
				})
			).rejects.toThrowError(
				expect.objectContaining({
					code: 'DRAFT_GENERATION_FAILED',
					name: 'DraftError',
				})
			);
		});
	});

	describe('Seeded 60% metric claim verification in pipeline', () => {
		it('verifies seeded 60% claim from mocked model output as NEEDS_INPUT', async () => {
			const repoPath = path.resolve('fixtures/demo-repo');
			const scan = scanRepo(repoPath);
			const ledger = buildLedger(scan);

			// Find readme_line fact for the 60% line
			const readmeFact = ledger.find(
				(f) =>
					f.type === 'readme_line' &&
					typeof f.value === 'object' &&
					f.value !== null &&
					(f.value as { text: string }).text.includes('60%')
			);
			expect(readmeFact).toBeDefined();

			const draftWithMetric: Draft = {
				paragraphs: [
					{
						claims: [
							{
								claim_id: 'c-seeded-metric',
								text: 'Cuts build time by 60% compared to the old pipeline.',
								type: 'metric',
								fact_ids: [readmeFact!.id],
							},
						],
					},
				],
			};

			const mockFetch = createMockFetch([
				{
					body: {
						model: config.MODEL_PRIMARY,
						message: {
							role: 'assistant',
							content: JSON.stringify(draftWithMetric),
						},
						prompt_eval_count: 60,
						eval_count: 20,
						total_duration: 700000000,
					},
				},
			]);

			const tempRunsDir = path.resolve('fixtures/temp-test-runs');
			try {
				const pipelineResult = await runPipeline(
					repoPath,
					config.MODEL_PRIMARY,
					{
						fetchFn: mockFetch,
						runsDir: tempRunsDir,
					}
				);

				expect(pipelineResult.verifiedClaims.length).toBe(1);
				const verifiedMetric = pipelineResult.verifiedClaims[0];

				expect(verifiedMetric.claim_id).toBe('c-seeded-metric');
				expect(verifiedMetric.status).toBe('needs_input');
				expect(verifiedMetric.reason).toBe(
					'metric needs measured evidence'
				);
				expect(pipelineResult.runRecord.claim_counts.needs_input).toBe(1);
				expect(pipelineResult.runRecord.claim_counts.verified).toBe(0);

				// Verify run file was written
				expect(fs.existsSync(pipelineResult.recordPath)).toBe(true);
				const savedContent = JSON.parse(
					fs.readFileSync(pipelineResult.recordPath, 'utf8')
				);
				expect(savedContent.model).toBe(config.MODEL_PRIMARY);
				expect(savedContent.claim_counts.needs_input).toBe(1);
			} finally {
				if (fs.existsSync(tempRunsDir)) {
					fs.rmSync(tempRunsDir, { recursive: true, force: true });
				}
			}
		});
	});
});
