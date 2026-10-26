import { Draft, DraftError, draftSchema, OllamaMetrics } from './types';

export interface GeminiChatOptions {
	apiKey: string;
	model: string;
	systemPrompt: string;
	userPrompt: string;
	timeoutMs?: number;
	fetchFn?: typeof fetch;
}

export interface GeminiChatResult {
	draft: Draft;
	metrics: OllamaMetrics;
}

export async function callGeminiGemmaChat(
	options: GeminiChatOptions
): Promise<GeminiChatResult> {
	const {
		apiKey,
		model,
		systemPrompt,
		userPrompt,
		timeoutMs = 60000,
		fetchFn = globalThis.fetch,
	} = options;

	if (!apiKey) {
		throw new DraftError(
			'GEMINI_HTTP_ERROR',
			'Missing GEMINI_API_KEY for hosted Gemma generation',
			model
		);
	}

	const controller = new AbortController();
	const timer = setTimeout(() => {
		controller.abort();
	}, timeoutMs);

	const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

	const requestBody = {
		systemInstruction: {
			parts: [
				{
					text: systemPrompt,
				},
			],
		},
		contents: [
			{
				role: 'user',
				parts: [
					{
						text: userPrompt,
					},
				],
			},
		],
		generationConfig: {
			temperature: 0.2,
			responseMimeType: 'application/json',
		},
	};

	let response: Response;
	try {
		response = await fetchFn(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(requestBody),
			signal: controller.signal,
		});
	} catch (err) {
		clearTimeout(timer);
		if (
			controller.signal.aborted ||
			(err instanceof Error && err.name === 'AbortError')
		) {
			throw new DraftError(
				'GEMINI_TIMEOUT',
				`Gemini request timed out after ${timeoutMs}ms`,
				model,
				err
			);
		}
		throw new DraftError(
			'GEMINI_HTTP_ERROR',
			`Gemini network error: ${err instanceof Error ? err.message : String(err)}`,
			model,
			err
		);
	} finally {
		clearTimeout(timer);
	}

	if (!response.ok) {
		const errorText = await response.text().catch(() => '');
		throw new DraftError(
			'GEMINI_HTTP_ERROR',
			`Gemini HTTP error ${response.status}: ${errorText}`,
			model,
			{ status: response.status, body: errorText }
		);
	}

	let responseJson: Record<string, unknown>;
	try {
		responseJson = (await response.json()) as Record<string, unknown>;
	} catch (err) {
		throw new DraftError(
			'INVALID_JSON_RESPONSE',
			`Failed to parse Gemini response as JSON: ${err instanceof Error ? err.message : String(err)}`,
			model,
			err
		);
	}

	const candidates = responseJson.candidates as Array<{
		content?: { parts?: Array<{ text?: string }> };
	}> | undefined;

	const rawText = candidates?.[0]?.content?.parts?.[0]?.text;
	if (typeof rawText !== 'string' || !rawText.trim()) {
		throw new DraftError(
			'INVALID_JSON_RESPONSE',
			'Gemini response candidate text is missing or empty',
			model,
			responseJson
		);
	}

	let jsonText = rawText.trim();
	if (jsonText.startsWith('```')) {
		jsonText = jsonText
			.replace(/^```(?:json)?\s*/i, '')
			.replace(/\s*```$/, '')
			.trim();
	}

	let parsedData: unknown;
	try {
		parsedData = JSON.parse(jsonText);
	} catch (err) {
		throw new DraftError(
			'INVALID_JSON_RESPONSE',
			`Gemini candidate text is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
			model,
			{ rawText, error: String(err) }
		);
	}

	const parsed = draftSchema.safeParse(parsedData);
	if (!parsed.success) {
		throw new DraftError(
			'INVALID_JSON_RESPONSE',
			`Gemini JSON output failed draft schema validation: ${parsed.error.message}`,
			model,
			{ parsedData, zodErrors: parsed.error.issues }
		);
	}

	const usage = responseJson.usageMetadata as {
		promptTokenCount?: number;
		candidatesTokenCount?: number;
		totalTokenCount?: number;
	} | undefined;

	const metrics: OllamaMetrics = {
		prompt_eval_count: usage?.promptTokenCount ?? null,
		eval_count: usage?.candidatesTokenCount ?? null,
		total_duration: null,
	};

	return {
		draft: parsed.data,
		metrics,
	};
}
