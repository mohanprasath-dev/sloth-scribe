import { DRAFT_JSON_SCHEMA, Draft, DraftError, draftSchema, OllamaMetrics } from './types';

export interface OllamaChatOptions {
	host: string;
	model: string;
	systemPrompt: string;
	userPrompt: string;
	timeoutMs?: number;
	fetchFn?: typeof fetch;
}

export interface OllamaChatResult {
	draft: Draft;
	metrics: OllamaMetrics;
}

export async function callOllamaChat(
	options: OllamaChatOptions
): Promise<OllamaChatResult> {
	const {
		host,
		model,
		systemPrompt,
		userPrompt,
		timeoutMs = 60000,
		fetchFn = globalThis.fetch,
	} = options;

	const controller = new AbortController();
	const timer = setTimeout(() => {
		controller.abort();
	}, timeoutMs);

	const url = `${host.replace(/\/+$/, '')}/api/chat`;
	const requestBody = {
		model,
		messages: [
			{ role: 'system', content: systemPrompt },
			{ role: 'user', content: userPrompt },
		],
		stream: false,
		options: {
			temperature: 0.2,
			num_ctx: 8192,
		},
		format: DRAFT_JSON_SCHEMA,
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
				'OLLAMA_TIMEOUT',
				`Ollama request timed out after ${timeoutMs}ms`,
				model,
				err
			);
		}
		throw new DraftError(
			'OLLAMA_HTTP_ERROR',
			`Ollama network error: ${err instanceof Error ? err.message : String(err)}`,
			model,
			err
		);
	} finally {
		clearTimeout(timer);
	}

	if (!response.ok) {
		const errorText = await response.text().catch(() => '');
		throw new DraftError(
			'OLLAMA_HTTP_ERROR',
			`Ollama HTTP error ${response.status}: ${errorText}`,
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
			`Failed to parse Ollama response as JSON: ${err instanceof Error ? err.message : String(err)}`,
			model,
			err
		);
	}

	const message = responseJson?.message as Record<string, unknown> | undefined;
	const content = message?.content;
	if (typeof content !== 'string') {
		throw new DraftError(
			'INVALID_JSON_RESPONSE',
			'Ollama response message content missing or not a string',
			model,
			responseJson
		);
	}

	let parsedDraft: unknown;
	try {
		parsedDraft = JSON.parse(content);
	} catch (err) {
		throw new DraftError(
			'INVALID_JSON_RESPONSE',
			`Failed to parse draft JSON from message content: ${err instanceof Error ? err.message : String(err)}`,
			model,
			{ content, error: err }
		);
	}

	const parseResult = draftSchema.safeParse(parsedDraft);
	if (!parseResult.success) {
		const issues = parseResult.error.issues.map((i) => i.message).join(', ');
		throw new DraftError(
			'INVALID_JSON_RESPONSE',
			`Draft schema validation failed: ${issues}`,
			model,
			{ content, issues: parseResult.error.issues }
		);
	}

	const promptEvalCount =
		typeof responseJson.prompt_eval_count === 'number'
			? responseJson.prompt_eval_count
			: null;
	const evalCount =
		typeof responseJson.eval_count === 'number'
			? responseJson.eval_count
			: null;
	const totalDuration =
		typeof responseJson.total_duration === 'number'
			? responseJson.total_duration
			: null;

	return {
		draft: parseResult.data,
		metrics: {
			prompt_eval_count: promptEvalCount,
			eval_count: evalCount,
			total_duration: totalDuration,
		},
	};
}
