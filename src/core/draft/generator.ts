import { config } from '../config';
import { ledgerForPrompt } from '../ledger/ledger';
import { Fact } from '../ledger/types';
import { callGeminiGemmaChat } from './gemini';
import { callOllamaChat } from './ollama';
import {
	Draft,
	DraftError,
	DraftParagraph,
	GenerateDraftResult,
} from './types';

export const DRAFT_SYSTEM_PROMPT =
	'You are a release-notes compiler. Propose claims strictly grounded in the provided fact ledger.\n' +
	'Strict rules:\n' +
	'1. You may only write claims supported by the listed fact ids.\n' +
	'2. Cite fact ids for every non-interpretation claim in the fact_ids array.\n' +
	'3. Assign the appropriate type for each claim: "count" for numerical counts, "date" for commit dates, "feature" for implemented features or files, "dependency" for packages, "script" for npm scripts, "metric" for performance numbers, "interpretation" for qualitative observations.\n' +
	'4. claim_id must be c1, c2, ... cN (never a fact id like F001).\n' +
	'5. You may include an optional "subject" field (short noun phrase naming the feature, package, or script, e.g. "CSV export", "commander", "test").\n' +
	'6. Interpretations must contain no numbers, dates, paths, or identifiers.\n' +
	'7. Output at most 12 claims total.\n' +
	'8. Do not invent features, numbers, or benefits.\n' +
	'9. If README text makes a performance claim, you may report that the README says it, citing the readme_line fact.\n' +
	'10. Return valid JSON matching the schema: paragraphs array with claims.';

export interface GenerateDraftOptions {
	modelOverride?: string;
	ollamaHost?: string;
	timeoutMs?: number;
	fetchFn?: typeof fetch;
	geminiApiKey?: string;
	geminiModel?: string;
}

export function normalizeClaimIds(draft: Draft): Draft {
	let index = 1;
	for (const p of draft.paragraphs) {
		for (const c of p.claims) {
			if (/^F\d+/i.test(c.claim_id) || !c.claim_id.toLowerCase().startsWith('c')) {
				c.claim_id = `c${index}`;
			}
			index++;
		}
	}
	return draft;
}

export function clampDraftClaims(draft: Draft, maxClaims = 12): Draft {
	let count = 0;
	const clampedParagraphs: DraftParagraph[] = [];

	for (const p of draft.paragraphs) {
		if (count >= maxClaims) {
			break;
		}
		const available = maxClaims - count;
		const sliced = p.claims.slice(0, available);
		if (sliced.length > 0) {
			clampedParagraphs.push({ claims: sliced });
			count += sliced.length;
		}
	}

	return { paragraphs: clampedParagraphs };
}

export async function generateDraft(
	ledger: Fact[],
	options?: GenerateDraftOptions
): Promise<GenerateDraftResult> {
	const geminiApiKey = options?.geminiApiKey || config.GEMINI_API_KEY;
	const isGemini = Boolean(
		geminiApiKey &&
			(options?.geminiApiKey ||
				options?.modelOverride?.startsWith('gemma-4-') ||
				options?.modelOverride === config.GEMINI_MODEL ||
				(!options?.modelOverride && config.GEMINI_API_KEY))
	);

	const fallbackModel = config.MODEL_FALLBACK;
	const host = options?.ollamaHost || config.OLLAMA_HOST;
	const timeoutMs = options?.timeoutMs ?? 60000;
	const fetchFn = options?.fetchFn;

	// Input to the model is ledgerForPrompt(ledger, 12000) only.
	// Never send raw diffs or file contents.
	const promptLedger = ledgerForPrompt(ledger, 12000);
	const userPrompt = `Fact ledger:\n${promptLedger.text}\n\nDraft a concise summary of this repository following all rules.`;

	if (isGemini) {
		const targetModel =
			options?.geminiModel ||
			(options?.modelOverride?.startsWith('gemma-4-')
				? options.modelOverride
				: config.GEMINI_MODEL);

		try {
			const result = await callGeminiGemmaChat({
				apiKey: geminiApiKey,
				model: targetModel,
				systemPrompt: DRAFT_SYSTEM_PROMPT,
				userPrompt,
				timeoutMs,
				fetchFn,
			});

			return {
				draft: clampDraftClaims(normalizeClaimIds(result.draft), 12),
				modelUsed: targetModel,
				fallbackUsed: false,
				fallbackReason: null,
				ollamaMetrics: result.metrics,
			};
		} catch (err) {
			if (
				err instanceof DraftError &&
				err.code === 'INVALID_JSON_RESPONSE'
			) {
				try {
					const retryResult = await callGeminiGemmaChat({
						apiKey: geminiApiKey,
						model: targetModel,
						systemPrompt: DRAFT_SYSTEM_PROMPT,
						userPrompt,
						timeoutMs,
						fetchFn,
					});

					return {
						draft: clampDraftClaims(normalizeClaimIds(retryResult.draft), 12),
						modelUsed: targetModel,
						fallbackUsed: false,
						fallbackReason: null,
						ollamaMetrics: retryResult.metrics,
					};
				} catch (retryErr) {
					throw new DraftError(
						'DRAFT_GENERATION_FAILED',
						`Gemini hosted model ${targetModel} failed after retry: ${retryErr instanceof Error ? retryErr.message : String(retryErr)}`,
						targetModel,
						retryErr
					);
				}
			}

			throw err;
		}
	}

	const primaryModel = options?.modelOverride || config.MODEL_PRIMARY;
	let primaryError: Error | null = null;
	let fallbackReason: string | null = null;

	// Attempt 1: primary model
	try {
		const result = await callOllamaChat({
			host,
			model: primaryModel,
			systemPrompt: DRAFT_SYSTEM_PROMPT,
			userPrompt,
			timeoutMs,
			fetchFn,
		});

		return {
			draft: clampDraftClaims(normalizeClaimIds(result.draft), 12),
			modelUsed: primaryModel,
			fallbackUsed: false,
			fallbackReason: null,
			ollamaMetrics: result.metrics,
		};
	} catch (err) {
		primaryError = err instanceof Error ? err : new Error(String(err));

		// Rule 4: invalid JSON -> retry once; still invalid, or Ollama error or timeout (60s) -> switch to MODEL_FALLBACK once
		if (
			err instanceof DraftError &&
			err.code === 'INVALID_JSON_RESPONSE'
		) {
			// Retry once with primary model
			try {
				const retryResult = await callOllamaChat({
					host,
					model: primaryModel,
					systemPrompt: DRAFT_SYSTEM_PROMPT,
					userPrompt,
					timeoutMs,
					fetchFn,
				});

				return {
					draft: clampDraftClaims(normalizeClaimIds(retryResult.draft), 12),
					modelUsed: primaryModel,
					fallbackUsed: false,
					fallbackReason: null,
					ollamaMetrics: retryResult.metrics,
				};
			} catch (retryErr) {
				primaryError =
					retryErr instanceof Error
						? retryErr
						: new Error(String(retryErr));
				fallbackReason = `primary model ${primaryModel} returned invalid JSON on retry: ${primaryError.message}`;
			}
		} else {
			fallbackReason = `primary model ${primaryModel} failed: ${primaryError.message}`;
		}
	}

	// Switch to MODEL_FALLBACK once
	try {
		const fallbackResult = await callOllamaChat({
			host,
			model: fallbackModel,
			systemPrompt: DRAFT_SYSTEM_PROMPT,
			userPrompt,
			timeoutMs,
			fetchFn,
		});

		return {
			draft: clampDraftClaims(normalizeClaimIds(fallbackResult.draft), 12),
			modelUsed: fallbackModel,
			fallbackUsed: true,
			fallbackReason,
			ollamaMetrics: fallbackResult.metrics,
		};
	} catch (fallbackErr) {
		const finalError =
			fallbackErr instanceof Error
				? fallbackErr
				: new Error(String(fallbackErr));

		throw new DraftError(
			'DRAFT_GENERATION_FAILED',
			`Both primary (${primaryModel}) and fallback (${fallbackModel}) failed: ${fallbackReason}; fallback error: ${finalError.message}`,
			fallbackModel,
			{ primaryError, fallbackError: finalError }
		);
	}
}
