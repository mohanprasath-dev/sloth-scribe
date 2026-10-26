import { describe, expect, it, vi } from 'vitest';
import { callGeminiGemmaChat } from './gemini';
import { generateDraft } from './generator';
import { Draft, DraftError } from './types';

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

function createMockGeminiFetch(
	responses: Array<{
		ok?: boolean;
		status?: number;
		body: unknown;
		delayMs?: number;
	}>
): typeof fetch {
	let callIndex = 0;

	return vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
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

		return {
			ok: isOk,
			status,
			statusText: isOk ? 'OK' : 'Internal Server Error',
			json: async () => current.body,
			text: async () =>
				typeof current.body === 'string'
					? current.body
					: JSON.stringify(current.body),
		} as Response;
	});
}

describe('callGeminiGemmaChat', () => {
	it('throws error when apiKey is empty', async () => {
		await expect(
			callGeminiGemmaChat({
				apiKey: '',
				model: 'gemma-4-26b-a4b-it',
				systemPrompt: 'sys',
				userPrompt: 'user',
			})
		).rejects.toThrow('Missing GEMINI_API_KEY');
	});

	it('returns parsed draft and usage metrics on valid response', async () => {
		const mockFetch = createMockGeminiFetch([
			{
				ok: true,
				status: 200,
				body: {
					candidates: [
						{
							content: {
								parts: [{ text: JSON.stringify(MOCK_VALID_DRAFT) }],
								role: 'model',
							},
							finishReason: 'STOP',
						},
					],
					usageMetadata: {
						promptTokenCount: 150,
						candidatesTokenCount: 45,
						totalTokenCount: 195,
					},
				},
			},
		]);

		const result = await callGeminiGemmaChat({
			apiKey: 'test-key',
			model: 'gemma-4-26b-a4b-it',
			systemPrompt: 'sys',
			userPrompt: 'user',
			fetchFn: mockFetch,
		});

		expect(result.draft).toEqual(MOCK_VALID_DRAFT);
		expect(result.metrics.prompt_eval_count).toBe(150);
		expect(result.metrics.eval_count).toBe(45);
	});

	it('strips markdown code fences from candidate text', async () => {
		const fenced = '```json\n' + JSON.stringify(MOCK_VALID_DRAFT) + '\n```';
		const mockFetch = createMockGeminiFetch([
			{
				ok: true,
				status: 200,
				body: {
					candidates: [
						{
							content: {
								parts: [{ text: fenced }],
								role: 'model',
							},
						},
					],
				},
			},
		]);

		const result = await callGeminiGemmaChat({
			apiKey: 'test-key',
			model: 'gemma-4-26b-a4b-it',
			systemPrompt: 'sys',
			userPrompt: 'user',
			fetchFn: mockFetch,
		});

		expect(result.draft).toEqual(MOCK_VALID_DRAFT);
	});

	it('handles HTTP errors properly', async () => {
		const mockFetch = createMockGeminiFetch([
			{
				ok: false,
				status: 403,
				body: 'Permission denied',
			},
		]);

		await expect(
			callGeminiGemmaChat({
				apiKey: 'test-key',
				model: 'gemma-4-26b-a4b-it',
				systemPrompt: 'sys',
				userPrompt: 'user',
				fetchFn: mockFetch,
			})
		).rejects.toThrow('Gemini HTTP error 403');
	});

	it('handles timeout properly', async () => {
		const mockFetch = createMockGeminiFetch([
			{
				ok: true,
				status: 200,
				delayMs: 200,
				body: { candidates: [] },
			},
		]);

		await expect(
			callGeminiGemmaChat({
				apiKey: 'test-key',
				model: 'gemma-4-26b-a4b-it',
				systemPrompt: 'sys',
				userPrompt: 'user',
				timeoutMs: 50,
				fetchFn: mockFetch,
			})
		).rejects.toThrow('Gemini request timed out');
	});

	it('throws INVALID_JSON_RESPONSE when text is not JSON', async () => {
		const mockFetch = createMockGeminiFetch([
			{
				ok: true,
				status: 200,
				body: {
					candidates: [
						{
							content: {
								parts: [{ text: 'not valid json' }],
							},
						},
					],
				},
			},
		]);

		await expect(
			callGeminiGemmaChat({
				apiKey: 'test-key',
				model: 'gemma-4-26b-a4b-it',
				systemPrompt: 'sys',
				userPrompt: 'user',
				fetchFn: mockFetch,
			})
		).rejects.toThrow('Gemini candidate text is not valid JSON');
	});
});

describe('generateDraft with Gemini API', () => {
	it('routes to Gemini when geminiApiKey is provided', async () => {
		const mockFetch = createMockGeminiFetch([
			{
				ok: true,
				status: 200,
				body: {
					candidates: [
						{
							content: {
								parts: [{ text: JSON.stringify(MOCK_VALID_DRAFT) }],
							},
						},
					],
					usageMetadata: {
						promptTokenCount: 100,
						candidatesTokenCount: 50,
					},
				},
			},
		]);

		const result = await generateDraft([], {
			geminiApiKey: 'mock-gemini-key',
			geminiModel: 'gemma-4-26b-a4b-it',
			fetchFn: mockFetch,
		});

		expect(result.modelUsed).toBe('gemma-4-26b-a4b-it');
		expect(result.fallbackUsed).toBe(false);
		expect(result.draft.paragraphs[0].claims.length).toBe(2);
		expect(mockFetch).toHaveBeenCalledTimes(1);
	});

	it('retries once if Gemini returns invalid JSON, then succeeds', async () => {
		const mockFetch = createMockGeminiFetch([
			{
				ok: true,
				status: 200,
				body: {
					candidates: [
						{
							content: {
								parts: [{ text: 'invalid json on first attempt' }],
							},
						},
					],
				},
			},
			{
				ok: true,
				status: 200,
				body: {
					candidates: [
						{
							content: {
								parts: [{ text: JSON.stringify(MOCK_VALID_DRAFT) }],
							},
						},
					],
				},
			},
		]);

		const result = await generateDraft([], {
			geminiApiKey: 'mock-gemini-key',
			fetchFn: mockFetch,
		});

		expect(result.draft.paragraphs[0].claims.length).toBe(2);
		expect(mockFetch).toHaveBeenCalledTimes(2);
	});
});
